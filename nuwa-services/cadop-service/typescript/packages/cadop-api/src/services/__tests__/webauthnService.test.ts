import { WebAuthnService } from '../WebAuthnService.js';
import { CadopError, CadopErrorCode, IDToken } from '@cadop/shared';
import crypto from 'crypto';
import type { 
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON 
} from '@simplewebauthn/types';
import { generateRandomDid } from '../../test/mocks.js';
import jwt from 'jsonwebtoken';


describe('WebAuthnService', () => {
  let service: WebAuthnService;

  beforeAll(async () => {
    service = new WebAuthnService();
  });

  describe('generateAuthenticationOptions', () => {
    it('should generate registration options for new user', async () => {
      const userInfo = {
        name: 'Test User',
        displayName: 'Test User Display'
      };

      const options = await service.generateAuthenticationOptions(undefined, userInfo);

      expect(options).toBeDefined();
      expect(options.isNewUser).toBe(true);
      expect(options.publicKey).toBeDefined();
      const regOptions = options.publicKey as PublicKeyCredentialCreationOptionsJSON;
      expect(regOptions.user?.name).toBe(userInfo.name);
      expect(regOptions.user?.displayName).toBe(userInfo.displayName);
      expect(regOptions.authenticatorSelection?.authenticatorAttachment).toBe('platform');
      expect(regOptions.authenticatorSelection?.requireResidentKey).toBe(true);
      expect(regOptions.authenticatorSelection?.residentKey).toBe('required');
    });

    it('should generate authentication options for existing user', async () => {
      const userId = crypto.randomUUID();
      const userDid = generateRandomDid();
      const userInfo = {
        name: 'Test User',
        displayName: 'Test User Display'
      };

      //First create a user record
      const user = await service['userRepo'].create({
        user_did: userDid,
        display_name: userInfo.displayName
      });

      // Create a mock authenticator
      await service['authenticatorRepo'].create({
        user_id: user.id,
        credential_id: crypto.randomBytes(32).toString('base64url'),
        credential_public_key: crypto.randomBytes(32).toString('base64'),
        counter: 0,
        credential_device_type: 'platform',
        credential_backed_up: true,
        transports: ['internal'],
        friendly_name: 'Test Device'
      });

      const options = await service.generateAuthenticationOptions(userDid, userInfo);
      
      expect(options).toBeDefined();
      expect(options.isNewUser).toBe(false);
      expect(options.publicKey).toBeDefined();
      const authOptions = options.publicKey as PublicKeyCredentialRequestOptionsJSON;
      expect(authOptions.allowCredentials).toBeDefined();
      expect(authOptions.allowCredentials?.length).toBe(1);
      expect(authOptions.userVerification).toBe('preferred');
      expect(options.user).toBeDefined();
      expect(options.user.id).toBe(user.id);
      expect(options.user.userDid).toBe(userDid);
      // Cleanup
      await service['authenticatorRepo'].deleteByUserId(user.id);
      await service['userRepo'].delete(user.id);
    });
  });

  describe('Challenge Management', () => {
    it('should create and retrieve challenge', async () => {
      const userId = crypto.randomUUID();
      const challenge = crypto.randomBytes(32).toString('base64url');

      await service['challengesRepo'].create({
        user_id: userId,
        challenge: challenge,
        operation_type: 'registration',
        expires_at: new Date(Date.now() + 60000),
        client_data: {
          email: 'test@example.com'
        }
      });

      const retrievedChallenge = await service['getChallenge'](challenge);
      expect(retrievedChallenge).toBeDefined();
      expect(retrievedChallenge?.challenge).toBe(challenge);
      expect(retrievedChallenge?.user_id).toBe(userId);
      expect(retrievedChallenge?.operation_type).toBe('registration');
    });

    it('should not retrieve expired challenge', async () => {
      const userId = crypto.randomUUID();
      const challenge = crypto.randomBytes(32).toString('base64url');

      // First create a valid challenge
      const createdChallenge = await service['challengesRepo'].create({
        user_id: userId,
        challenge: challenge,
        operation_type: 'registration',
        expires_at: new Date(Date.now() + 1000), // valid for 1 second
        client_data: {
          email: 'test@example.com'
        }
      });

      // Wait for it to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const retrievedChallenge = await service['getChallenge'](challenge);
      expect(retrievedChallenge).toBeNull();
    });

    it('should not retrieve used challenge', async () => {
      const userId = crypto.randomUUID();
      const challenge = crypto.randomBytes(32).toString('base64url');

      const createdChallenge = await service['challengesRepo'].create({
        user_id: userId,
        challenge: challenge,
        operation_type: 'registration',
        expires_at: new Date(Date.now() + 60000),
        client_data: {
          email: 'test@example.com'
        }
      });

      await service['challengesRepo'].markAsUsed(createdChallenge.id);

      const retrievedChallenge = await service['getChallenge'](challenge);
      expect(retrievedChallenge).toBeNull();
    });
  });

  describe('getIdToken and verifyIdToken', () => {
    let user: any;
    let mockPublicKey: Buffer;
    let authenticator: any;
    let validToken: IDToken;

    beforeEach(async () => {
      // Setup: Create test user and authenticator
      const userDid = generateRandomDid();
      user = await service['userRepo'].create({
        user_did: userDid,
        display_name: 'Test User'
      });

      // Create mock authenticator
      mockPublicKey = crypto.randomBytes(32);
      authenticator = await service['authenticatorRepo'].create({
        user_id: user.id,
        credential_id: crypto.randomBytes(32).toString('base64url'),
        credential_public_key: mockPublicKey.toString('hex'),
        counter: 0,
        credential_device_type: 'platform',
        credential_backed_up: true,
        transports: ['internal'],
        friendly_name: 'Test Device'
      });

      // Get a valid token for tests
      validToken = await service.getIdToken(user.id);
    });

    afterEach(async () => {
      // Cleanup
      await service['authenticatorRepo'].deleteByUserId(user.id);
      await service['userRepo'].delete(user.id);
    });

    it('should generate and verify valid ID token', async () => {
      // Verify the token
      const verified = await service.verifyIdToken(validToken);
      
      // Check verified token claims
      expect(verified).toMatchObject({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: service['serviceDid'],
        sybil_level: 1
      });

      // Verify public key
      expect(verified.pub_jwk).toBeDefined();
      expect(verified.pub_jwk.kty).toBe('OKP');
      expect(verified.pub_jwk.crv).toBe('Ed25519');
      expect(verified.pub_jwk.x).toBe(mockPublicKey.toString('base64url'));
    });

    it('should verify token with specific audience', async () => {
      const customAudience = 'did:rooch:custodian';
      
      // Generate token with custom audience
      const token = jwt.sign({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: customAudience,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: mockPublicKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, service['signingKey']);

      // Should fail with wrong audience
      await expect(service.verifyIdToken({ id_token: token }, 'did:rooch:wrong-custodian'))
        .rejects
        .toThrow(expect.objectContaining({
          code: CadopErrorCode.TOKEN_INVALID_AUDIENCE,
          message: 'Invalid token audience'
        }));

      // Should succeed with correct audience
      const verified = await service.verifyIdToken({ id_token: token }, customAudience);
      expect(verified.aud).toBe(customAudience);
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: service['serviceDid'],
        exp: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago
        iat: Math.floor(Date.now() / 1000) - 300,
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: mockPublicKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, service['signingKey']);

      await expect(service.verifyIdToken({ id_token: expiredToken }))
        .rejects
        .toThrow(expect.objectContaining({
          code: CadopErrorCode.TOKEN_EXPIRED,
          message: 'Token has expired'
        }));
    });

    it('should reject token with invalid signature', async () => {
      const invalidToken = jwt.sign({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: service['serviceDid'],
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: mockPublicKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, 'wrong-signing-key');

      await expect(service.verifyIdToken({ id_token: invalidToken }))
        .rejects
        .toThrow(expect.objectContaining({
          code: CadopErrorCode.TOKEN_INVALID_SIGNATURE,
          message: 'Invalid token signature'
        }));
    });

    it('should reject token with mismatched public key', async () => {
      const differentKey = crypto.randomBytes(32);
      const tokenWithDifferentKey = jwt.sign({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: service['serviceDid'],
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: differentKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, service['signingKey']);

      await expect(service.verifyIdToken({ id_token: tokenWithDifferentKey }))
        .rejects
        .toThrow(expect.objectContaining({
          code: CadopErrorCode.TOKEN_PUBLIC_KEY_MISMATCH,
          message: 'Public key mismatch'
        }));
    });

    it('should reject token for non-existent user', async () => {
      // Generate token with non-existent user DID
      const tokenWithNonExistentUser = jwt.sign({
        iss: service['serviceDid'],
        sub: 'did:example:nonexistent',
        aud: service['serviceDid'],
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: mockPublicKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, service['signingKey']);

      await expect(service.verifyIdToken({ id_token: tokenWithNonExistentUser }))
        .rejects
        .toThrow('User not found');
    });

    it('should reject token with invalid audience', async () => {
      const customAudience = 'did:rooch:custodian';
      const token = jwt.sign({
        iss: service['serviceDid'],
        sub: user.user_did,
        aud: customAudience,
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
        pub_jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: mockPublicKey.toString('base64url'),
          alg: 'EdDSA',
          use: 'sig'
        },
        sybil_level: 1
      }, service['signingKey']);

      await expect(service.verifyIdToken({ id_token: token }, 'did:rooch:wrong-custodian'))
        .rejects
        .toThrow(expect.objectContaining({
          code: CadopErrorCode.TOKEN_INVALID_AUDIENCE,
          message: 'Invalid token audience'
        }));
    });
  });
}); 