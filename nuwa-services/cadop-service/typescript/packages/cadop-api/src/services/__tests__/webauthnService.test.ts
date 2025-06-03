import { WebAuthnService } from '../webauthnService.js';
import {
  mockUser,
  mockAuthenticator,
  mockWebAuthnRegistrationResponse,
  mockWebAuthnAuthenticationResponse,
  createMockSupabaseClient,
  mockLogger,
} from '../../test/mocks.js';
import type {
  RegistrationResponseJSON,
  AuthenticatorTransportFuture,
  AuthenticatorAttachment,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// Mock external dependencies
jest.mock('../../config/supabase', () => ({
  supabase: createMockSupabaseClient(),
}));
jest.mock('../../utils/logger', () => ({
  logger: mockLogger,
}));

// 创建真实的测试数据
const mockCredentialIdBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const mockCredentialId = isoBase64URL.fromBuffer(mockCredentialIdBuffer);
const mockPublicKeyBuffer = new Uint8Array([
  0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 
  0x58, 0x20, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00,
]);
const mockPublicKey = isoBase64URL.fromBuffer(mockPublicKeyBuffer);

const mockAuthenticatorDataBuffer = new Uint8Array([
  0x49, 0x96, 0x0d, 0xe5, 0x88, 0x0e, 0x8c, 0x68,
]);
const mockAuthenticatorData = isoBase64URL.fromBuffer(mockAuthenticatorDataBuffer);

describe('WebAuthn Service', () => {
  let webAuthnService: WebAuthnService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Set up environment variables
    process.env['WEBAUTHN_RP_NAME'] = 'Test CADOP Service';
    process.env['WEBAUTHN_RP_ID'] = 'localhost';
    process.env['WEBAUTHN_ORIGIN'] = 'http://localhost:3000';
    process.env['WEBAUTHN_CHALLENGE_TIMEOUT'] = '300000';
    process.env['WEBAUTHN_EXPECTED_ORIGIN'] = 'http://localhost:3000';
    process.env['WEBAUTHN_EXPECTED_RP_ID'] = 'localhost';

    webAuthnService = new WebAuthnService();
  });

  describe('WebAuthn Service Construction', () => {
    it('should initialize with correct configuration', () => {
      expect(webAuthnService).toBeInstanceOf(WebAuthnService);
    });

    it('should use default values for missing environment variables', () => {
      delete process.env['WEBAUTHN_RP_NAME'];
      delete process.env['WEBAUTHN_RP_ID'];

      const service = new WebAuthnService();
      expect(service).toBeInstanceOf(WebAuthnService);
    });
  });

  describe('Public Key Storage and Verification', () => {
    it('should correctly store and retrieve public key', async () => {
      const mockRegistrationResponse: RegistrationResponseJSON = {
        id: mockCredentialId,
        rawId: mockCredentialId,
        response: {
          attestationObject: isoBase64URL.fromBuffer(new Uint8Array([1, 2, 3, 4])),
          clientDataJSON: JSON.stringify({
            type: 'webauthn.create',
            challenge: 'test-challenge',
            origin: 'http://localhost:3000',
          }),
        },
        type: 'public-key',
        clientExtensionResults: {},
      };

      // 使用真实的 WebAuthn 服务进行验证
      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockRegistrationResponse,
        'Test Device'
      );

      expect(result.success).toBe(true);
      if (result.success && result.authenticator) {
        expect(result.authenticator.credentialId).toBeDefined();
        expect(result.authenticator.friendlyName).toBe('Test Device');
      }
    });

    it('should correctly verify stored public key during authentication', async () => {
      const mockAuthResponse: AuthenticationResponseJSON = {
        id: mockCredentialId,
        rawId: mockCredentialId,
        response: {
          authenticatorData: mockAuthenticatorData,
          clientDataJSON: JSON.stringify({
            type: 'webauthn.get',
            challenge: 'test-challenge',
            origin: 'http://localhost:3000',
          }),
          signature: isoBase64URL.fromBuffer(new Uint8Array([1, 2, 3, 4])),
          userHandle: mockUser.id,
        },
        type: 'public-key',
        clientExtensionResults: {},
      };

      const result = await webAuthnService.verifyAuthenticationResponse(
        mockAuthResponse,
        'test-challenge'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBeDefined();
        expect(result.authenticatorId).toBeDefined();
      }
    });

    it('should handle invalid public key format', async () => {
      const invalidRegistrationResponse: RegistrationResponseJSON = {
        ...mockWebAuthnRegistrationResponse,
        response: {
          ...mockWebAuthnRegistrationResponse.response,
          attestationObject: 'invalid-attestation', // 使用无效的 attestation 对象
        },
      };

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        invalidRegistrationResponse,
        'Test Device'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle database errors during public key storage', async () => {
      const mockDbError = new Error('Database error');
      const mockSupabase = createMockSupabaseClient();
      mockSupabase.from().insert.mockRejectedValue(mockDbError);

      const result = await webAuthnService.verifyRegistrationResponse(
        mockUser.id,
        mockWebAuthnRegistrationResponse,
        'Test Device'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Device Management', () => {
    it('should handle getUserDevices', async () => {
      const devices = await webAuthnService.getUserDevices(mockUser.id);
      expect(Array.isArray(devices)).toBe(true);
    });

    it('should handle removeDevice', async () => {
      const result = await webAuthnService.removeDevice(mockUser.id, mockAuthenticator.id);
      expect(typeof result).toBe('boolean');
    });

    it('should handle cleanupExpiredChallenges', async () => {
      const result = await webAuthnService.cleanupExpiredChallenges();
      expect(typeof result).toBe('number');
    });
  });
}); 