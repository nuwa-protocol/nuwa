import { WebAuthnService } from '../WebAuthnService.js';
import crypto from 'crypto';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { generateRandomDid } from '../../test/mocks.js';

describe('WebAuthnService Real Data Test', () => {
  let service: WebAuthnService;
  const testCredentialId = 'zL7EOz5Vd-iSGG0-z8yR0k2MKvdVRUdHT8T0-tnuPP438szQNVEvpNRjn_0';

  beforeAll(async () => {
    service = new WebAuthnService();
  });

  beforeEach(async () => {
    // Clean up the specific test challenge and authenticator before test
    await service['challengesRepo'].deleteByChallenge('wXfuBHclXXuUT16qn-6wh-JttB2yXUnmkgbSnTJqRJc');
    await service['authenticatorRepo'].deleteByCredentialId(testCredentialId);
  });

  it('should verify real registration response', async () => {
    const testUserId = crypto.randomUUID();
    const testUserDid = generateRandomDid();
    // This challenge must match the one in mockRegistrationResponse
    const testChallenge = 'wXfuBHclXXuUT16qn-6wh-JttB2yXUnmkgbSnTJqRJc';
    await service['userRepo'].create({
      id: testUserId,
      user_did: testUserDid,
      email: `${testUserId}@example.com`,
      display_name: 'Test User'
    });
    // Create a test challenge in the database
    await service['challengesRepo'].create({
      user_id: testUserId,
      challenge: testChallenge,
      operation_type: 'registration',
      expires_at: new Date(Date.now() + 60000), // expires in 1 minute
      client_data: {
        email: 'test@example.com'
      }
    });

    // Use real registration response data
    const mockRegistrationResponse: RegistrationResponseJSON = {
      id: testCredentialId,
      rawId: testCredentialId,
      response: {
        attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViwSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAALraVWanqkAfvZZFYZpVEg0ALMy-xDs-VXfokhhtPs_MkdJNjCr3VUVHR0_E9PrZ7jz-N_LM0DVRL6TUY5_9pQECAyYgASFYII-LrpXKOZo9-h7a-xGe11rT9ZoGZne62YFvUFbcBPmkIlggWOgNc9urJyWVUei-sQ6fsw4SFAbiXc3KhWwmqkzNQao',
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoid1hmdUJIY2xYWHVVVDE2cW4tNndoLUp0dEIyeVhVbm1rZ2JTblRKcVJKYyIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImNyb3NzT3JpZ2luIjpmYWxzZX0',
        transports: ['internal', 'hybrid']
      },
      type: 'public-key',
      clientExtensionResults: {
        credProps: {
          rk: true
        }
      },
      authenticatorAttachment: 'platform'
    };
    const result = await service.verifyAuthenticationResponse(mockRegistrationResponse);
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.session?.user.id).toBe(testUserId);
  });
}); 