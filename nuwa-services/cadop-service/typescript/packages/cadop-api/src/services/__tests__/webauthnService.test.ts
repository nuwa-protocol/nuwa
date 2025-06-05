import { WebAuthnService } from '../webauthnService.js';
import crypto from 'crypto';
import type { 
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON 
} from '@simplewebauthn/types';
import { generateRandomDid } from '../../test/mocks.js';


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
}); 