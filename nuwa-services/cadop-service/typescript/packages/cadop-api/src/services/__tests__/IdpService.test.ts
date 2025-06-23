import { IdpService, IdpServiceConfig } from '../IdpService.js';
import { DidKeyCodec } from '@nuwa-ai/identity-kit';
import { randomBytes } from 'crypto';
import { PublicKeyCredentialJSON } from '@simplewebauthn/types';

// Mock @simplewebauthn/server
jest.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: jest.fn().mockResolvedValue({ verified: true }),
}));

const rpId = 'localhost';
const origin = 'http://localhost:3000';

describe('IdpService', () => {
  let idpService: IdpService;
  const mockConfig: IdpServiceConfig = {
    cadopDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    signingKey: 'test-signing-key',
  };

  beforeEach(() => {
    idpService = new IdpService(mockConfig);
    jest.clearAllMocks();
  });

  describe('generateChallenge', () => {
    it('should generate a valid challenge response', () => {
      const response = idpService.generateChallenge();

      expect(response).toHaveProperty('challenge');
      expect(response).toHaveProperty('nonce');

      expect(typeof response.challenge).toBe('string');
      expect(response.challenge.length).toBeGreaterThan(10);
      expect(typeof response.nonce).toBe('string');
      expect(response.nonce.length).toBeGreaterThan(10);
    });

    it('should generate unique challenges on each call', () => {
      const response1 = idpService.generateChallenge();
      const response2 = idpService.generateChallenge();

      expect(response1.challenge).not.toBe(response2.challenge);
      expect(response1.nonce).not.toBe(response2.nonce);
    });
  });

  describe('verifyAssertion', () => {
    it('should verify a valid assertion and return an id token', async () => {
      // Generate a challenge first
      const { challenge, nonce } = idpService.generateChallenge();
      const userDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

      // Create a mock assertion
      const mockAssertion: PublicKeyCredentialJSON = {
        id: 'credential-id',
        rawId: 'raw-id-base64',
        type: 'public-key',
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.get',
              challenge,
              origin: origin,
            })
          ).toString('base64url'),
          authenticatorData: 'auth-data-base64',
          signature: 'signature-base64',
          userHandle: undefined,
        },
        clientExtensionResults: {},
      };

      const response = await idpService.verifyAssertion(mockAssertion, userDid, nonce, rpId, origin);

      expect(response).toHaveProperty('idToken');
      expect(typeof response.idToken).toBe('string');
      expect(response.idToken.length).toBeGreaterThan(10);
      expect(response).toHaveProperty('isNewUser', false);
    });

    it('should throw an error for invalid challenge', async () => {
      const userDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
      const nonce = 'valid-nonce';

      // Create a mock assertion with invalid challenge
      const mockAssertion: PublicKeyCredentialJSON = {
        id: 'credential-id',
        rawId: 'raw-id-base64',
        type: 'public-key',
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.get',
              challenge: 'invalid-challenge',
              origin: origin,
            })
          ).toString('base64url'),
          authenticatorData: 'auth-data-base64',
          signature: 'signature-base64',
          userHandle: undefined,
        },
        clientExtensionResults: {},
      };

      await expect(idpService.verifyAssertion(mockAssertion, userDid, nonce, rpId, origin)).rejects.toThrow(
        'invalid or expired challenge'
      );
    });

    it('should throw an error for nonce mismatch', async () => {
      // Generate a challenge first
      const { challenge } = idpService.generateChallenge();
      const userDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

      // Create a mock assertion
      const mockAssertion: PublicKeyCredentialJSON = {
        id: 'credential-id',
        rawId: 'raw-id-base64',
        type: 'public-key',
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.get',
              challenge,
              origin: origin,
            })
          ).toString('base64url'),
          authenticatorData: 'auth-data-base64',
          signature: 'signature-base64',
          userHandle: undefined,
        },
        clientExtensionResults: {},
      };

      await expect(
        idpService.verifyAssertion(mockAssertion, userDid, 'wrong-nonce', rpId, origin)
      ).rejects.toThrow('nonce mismatch');
    });
  });
});
