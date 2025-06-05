import { WebAuthnService } from '../webauthnService.js';
import { DatabaseService } from '../database.js';
import { supabase } from '../../config/supabase.js';
import type { Database } from '../../config/supabase.js';
import crypto from 'crypto';
import type { AuthenticationOptions } from '@cadop/shared';
import type { 
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON 
} from '@simplewebauthn/types';

type UserInsert = Database['public']['Tables']['users']['Insert'];

describe('WebAuthnService', () => {
  let service: WebAuthnService;

  beforeAll(async () => {
    service = new WebAuthnService();
  });

  describe('generateAuthenticationOptions', () => {
    it('should generate registration options for new user', async () => {
      const userId = crypto.randomUUID();
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
      const userDid = `did:key:${crypto.randomBytes(32).toString('hex')}`;
      const userInfo = {
        name: 'Test User',
        displayName: 'Test User Display'
      };

      // First create a user record
      await DatabaseService.createUser({
        id: userId,
        user_did: userDid,
        display_name: userInfo.displayName
      } as UserInsert);

      // Create a mock authenticator
      await service['authenticatorRepo'].create({
        user_id: userId,
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

      // Cleanup
      await service['authenticatorRepo'].deleteByUserId(userId);
      await supabase.from('users').delete().eq('user_did', userDid);
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