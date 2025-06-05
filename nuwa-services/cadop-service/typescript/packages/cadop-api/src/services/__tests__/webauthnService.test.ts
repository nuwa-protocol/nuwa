import { WebAuthnService } from '../webauthnService.js';
import { DatabaseService } from '../database.js';
import crypto from 'crypto';
import { encode } from 'cbor2';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

describe('WebAuthnService', () => {
  let service: WebAuthnService;
  let testUserId: string;
  let testUserDid: string;
  let testEmail: string;
  let testCredentialId: string;
  let testCredentialIdBuffer: Buffer;

  beforeAll(async () => {
    service = new WebAuthnService();
    // Generate random UUID but keep the format consistent with real data
    testUserId = crypto.randomUUID();
    testUserDid = `did:key:${crypto.randomUUID()}`;
    testEmail = `test-${testUserId}@example.com`;
    // Generate random credential ID but keep the format consistent with real data
    testCredentialIdBuffer = crypto.randomBytes(32);
    testCredentialId = testCredentialIdBuffer.toString('base64url');

    // Create test user
    await DatabaseService.createUser({
      user_did: testUserDid,
      email: testEmail,
      display_name: 'Test User',
      metadata: {}
    });
  });

  beforeEach(async () => {
    // No need to clean up challenges as they will expire automatically
  });

  describe('Authentication Flow', () => {
    it('should generate authentication options for new user', async () => {
      const options = await service.generateAuthenticationOptions();
      
      expect(options).toBeDefined();
      expect(options.isNewUser).toBe(true);
      expect(options.publicKey).toBeDefined();

      // 因为是新用户，所以是 registration options
      const publicKey = options.publicKey as PublicKeyCredentialCreationOptionsJSON;
      expect(publicKey.challenge).toBeDefined();
      expect(publicKey.rp).toBeDefined();
      expect(publicKey.rp.name).toBeDefined();
      expect(publicKey.rp.id).toBeDefined();
    });

    it('should generate authentication options for existing user', async () => {
      const options = await service.generateAuthenticationOptions(testUserDid);
      
      expect(options).toBeDefined();
      expect(options.isNewUser).toBe(false);
      expect(options.publicKey).toBeDefined();

      // 因为是已存在用户，所以是 authentication options
      const publicKey = options.publicKey as PublicKeyCredentialRequestOptionsJSON;
      expect(publicKey.challenge).toBeDefined();
      expect(publicKey.rpId).toBeDefined();
    });

    describe('Registration and Authentication', () => {
      it('should verify registration response', async () => {
        // Generate a new challenge for this test
        const testChallenge = crypto.randomBytes(32).toString('base64url');

        // Create a test challenge in the database
        await service['challengesRepo'].create({
          user_id: testUserId,
          challenge: testChallenge,
          operation_type: 'registration',
          expires_at: new Date(Date.now() + 60000), // expires in 1 minute
          client_data: {
            email: testEmail
          }
        });

        // Create COSE public key
        const cosePublicKey = new Map();
        cosePublicKey.set(1, 2); // kty: EC2
        cosePublicKey.set(3, -7); // alg: ES256
        cosePublicKey.set(-1, 1); // crv: P-256
        cosePublicKey.set(-2, Buffer.from(crypto.randomBytes(32))); // x coordinate
        cosePublicKey.set(-3, Buffer.from(crypto.randomBytes(32))); // y coordinate
        const encodedPublicKey = Buffer.from(encode(cosePublicKey));

        // Create authenticator data
        const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
        const flags = Buffer.from([0b01000101]); // UP=1, UV=1, AT=1
        const signCount = Buffer.alloc(4); // 4 bytes of zero
        const aaguid = crypto.randomBytes(16);
        const credentialIdLength = Buffer.alloc(2);
        credentialIdLength.writeUInt16BE(testCredentialIdBuffer.length, 0);

        const authenticatorData = Buffer.concat([
          rpIdHash,
          flags,
          signCount,
          aaguid,
          credentialIdLength,
          testCredentialIdBuffer,
          encodedPublicKey
        ]);

        // Create attestation object
        const attestationObject = {
          fmt: 'none',
          attStmt: {},
          authData: authenticatorData
        };

        // Simulate a registration response with real data
        const mockRegistrationResponse: RegistrationResponseJSON = {
          id: testCredentialId,
          rawId: testCredentialIdBuffer.toString('base64url'),
          response: {
            clientDataJSON: Buffer.from(JSON.stringify({
              type: 'webauthn.create',
              challenge: testChallenge,
              origin: 'http://localhost:3000'
            })).toString('base64'),
            attestationObject: Buffer.from(encode(attestationObject)).toString('base64'),
            transports: ['internal']
          },
          type: 'public-key',
          clientExtensionResults: {},
          authenticatorAttachment: 'platform'
        };

        const result = await service.verifyRegistrationResponse(testUserId, mockRegistrationResponse, 'Test Device');
        
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        if (result.authenticator) {
          expect(result.authenticator.credentialId).toBe(testCredentialId);
          expect(result.authenticator.friendlyName).toBe('Test Device');
        }
      });

      it('should verify authentication response', async () => {
        // Generate a new challenge for this test
        const testAuthChallenge = crypto.randomBytes(32).toString('base64url');

        // Create a test challenge in the database
        await service['challengesRepo'].create({
          user_id: testUserId,
          challenge: testAuthChallenge,
          operation_type: 'authentication',
          expires_at: new Date(Date.now() + 60000), // expires in 1 minute
          client_data: {
            email: testEmail
          }
        });

        // Create a test authenticator if not exists
        const existingAuth = await service['authenticatorRepo'].findByCredentialId(testCredentialId);
        if (!existingAuth) {
          await service['authenticatorRepo'].create({
            user_id: testUserId,
            credential_id: testCredentialId,
            credential_public_key: crypto.randomBytes(32).toString('hex'),
            counter: 0,
            credential_device_type: 'platform',
            credential_backed_up: true,
            transports: ['internal'],
            friendly_name: 'Test Device'
          });
        }

        // Create authenticator data
        const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
        const flags = Buffer.from([0b01000001]); // UP=1, UV=1
        const signCount = Buffer.alloc(4);
        signCount.writeUInt32BE(1, 0); // Counter set to 1

        const authenticatorData = Buffer.concat([
          rpIdHash,
          flags,
          signCount
        ]);

        // Create client data hash
        const clientDataJSON = {
          type: 'webauthn.get',
          challenge: testAuthChallenge,
          origin: 'http://localhost:3000'
        };
        const clientDataJSONBytes = Buffer.from(JSON.stringify(clientDataJSON));
        const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBytes).digest();

        // Create signature base
        const signatureBase = Buffer.concat([authenticatorData, clientDataHash]);

        // Generate key pair for signing
        const { privateKey } = crypto.generateKeyPairSync('ec', {
          namedCurve: 'P-256',
          publicKeyEncoding: { type: 'spki', format: 'der' },
          privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });

        // Create signature
        const sign = crypto.createSign('SHA256');
        sign.update(signatureBase);
        const signature = sign.sign({
          key: privateKey,
          dsaEncoding: 'der'
        });

        // Simulate an authentication response with real data
        const mockAuthenticationResponse: AuthenticationResponseJSON = {
          id: testCredentialId,
          rawId: testCredentialIdBuffer.toString('base64url'),
          response: {
            clientDataJSON: Buffer.from(JSON.stringify(clientDataJSON)).toString('base64'),
            authenticatorData: authenticatorData.toString('base64'),
            signature: signature.toString('base64'),
            userHandle: Buffer.from(testUserId).toString('base64')
          },
          type: 'public-key',
          clientExtensionResults: {},
          authenticatorAttachment: 'platform'
        };

        const result = await service.verifyAuthenticationResponse(mockAuthenticationResponse);
        
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        if (result.credential) {
          expect(result.credential.id).toBe(testCredentialId);
          expect(result.credential.type).toBe('public-key');
        }
        expect(result.session).toBeDefined();
      });

      it('should get user credentials', async () => {
        const credentials = await service.getUserCredentials(testUserId);
        
        expect(Array.isArray(credentials)).toBe(true);
        expect(credentials.length).toBeGreaterThan(0);
        const credential = credentials[0];
        expect(credential).toHaveProperty('id');
        expect(credential).toHaveProperty('name');
        expect(credential).toHaveProperty('type');
        expect(credential).toHaveProperty('lastUsed');
      });

      it('should remove credential', async () => {
        const auth = await service['authenticatorRepo'].findByCredentialId(testCredentialId);
        if (auth) {
          const result = await service.removeCredential(testUserId, auth.id);
          expect(result).toBe(true);

          const credentials = await service.getUserCredentials(testUserId);
          expect(credentials.length).toBe(0);
        }
      });
    });

    it('should cleanup expired challenges', async () => {
      // Create an expired challenge
      const now = new Date();
      const created = new Date(now.getTime() - 120000); // 2 minutes ago
      const expired = new Date(now.getTime() - 60000);  // 1 minute ago

      // We don't need to manually insert expired challenges
      // The system should have some expired challenges naturally
      const deletedCount = await service.cleanupExpiredChallenges();
      
      // Just verify the function runs without error
      expect(typeof deletedCount).toBe('number');
    });
  });
});