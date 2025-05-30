import request from 'supertest';
import express from 'express';
import webauthnRouter from '../webauthn.js';
import { mockUser } from '../../test/mocks.js';

// Mock dependencies
jest.mock('../../services/webauthnService');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/webauthn', webauthnRouter);

describe('WebAuthn Routes', () => {
  let mockWebAuthnService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment
    process.env['JWT_SECRET'] = 'test-jwt-secret';
    
    // Mock WebAuthn service
    const { WebAuthnService } = require('../../services/webauthnService');
    mockWebAuthnService = {
      generateRegistrationOptions: jest.fn(),
      verifyRegistrationResponse: jest.fn(),
      generateAuthenticationOptions: jest.fn(),
      verifyAuthenticationResponse: jest.fn(),
      getUserDevices: jest.fn(),
      removeDevice: jest.fn(),
    };
    WebAuthnService.mockImplementation(() => mockWebAuthnService);
  });

  describe('POST /webauthn/register/begin', () => {
    it('should generate registration options', async () => {
      const registrationOptions = {
        challenge: 'test-challenge',
        rp: { name: 'CADOP Service', id: 'localhost' },
        user: { id: mockUser.id, name: mockUser.email, displayName: mockUser.name },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 300000,
      };

      mockWebAuthnService.generateRegistrationOptions.mockResolvedValue(registrationOptions);

      const response = await request(app)
        .post('/webauthn/register/begin')
        .send({
          userId: mockUser.id,
          userEmail: mockUser.email,
          userName: mockUser.name,
        })
        .expect(200);

      expect(response.body).toEqual(registrationOptions);
      expect(mockWebAuthnService.generateRegistrationOptions).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        mockUser.name
      );
    });

    it('should handle missing required fields', async () => {
      await request(app)
        .post('/webauthn/register/begin')
        .send({})
        .expect(400);
    });

    it('should handle service errors', async () => {
      mockWebAuthnService.generateRegistrationOptions.mockRejectedValue(
        new Error('Service error')
      );

      await request(app)
        .post('/webauthn/register/begin')
        .send({
          userId: mockUser.id,
          userEmail: mockUser.email,
        })
        .expect(500);
    });
  });

  describe('POST /webauthn/register/finish', () => {
    it('should verify registration response', async () => {
      const mockResult = {
        success: true,
        authenticator: {
          id: 'auth-123',
          friendly_name: 'My Device',
          created_at: new Date().toISOString(),
        },
      };

      mockWebAuthnService.verifyRegistrationResponse.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/webauthn/register/finish')
        .send({
          userId: mockUser.id,
          response: {
            id: 'test-credential',
            rawId: 'test-credential',
            response: {
              clientDataJSON: 'test-data',
              attestationObject: 'test-attestation',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
          friendlyName: 'My Device',
        })
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should handle verification failure', async () => {
      const mockResult = {
        success: false,
        error: 'Verification failed',
      };

      mockWebAuthnService.verifyRegistrationResponse.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/webauthn/register/finish')
        .send({
          userId: mockUser.id,
          response: {
            id: 'test-credential',
            rawId: 'test-credential',
            response: {
              clientDataJSON: 'test-data',
              attestationObject: 'test-attestation',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /webauthn/auth/begin', () => {
    it('should generate authentication options', async () => {
      const authOptions = {
        challenge: 'auth-challenge',
        timeout: 300000,
        rpId: 'localhost',
        allowCredentials: [],
      };

      mockWebAuthnService.generateAuthenticationOptions.mockResolvedValue(authOptions);

      const response = await request(app)
        .post('/webauthn/auth/begin')
        .send({
          userId: mockUser.id,
        })
        .expect(200);

      expect(response.body).toEqual(authOptions);
    });

    it('should handle authentication options without user ID', async () => {
      const authOptions = {
        challenge: 'auth-challenge',
        timeout: 300000,
        rpId: 'localhost',
        allowCredentials: [],
      };

      mockWebAuthnService.generateAuthenticationOptions.mockResolvedValue(authOptions);

      await request(app)
        .post('/webauthn/auth/begin')
        .send({})
        .expect(200);

      expect(mockWebAuthnService.generateAuthenticationOptions).toHaveBeenCalledWith(undefined);
    });
  });

  describe('POST /webauthn/auth/finish', () => {
    it('should verify authentication response', async () => {
      const mockResult = {
        success: true,
        user: {
          id: mockUser.id,
          email: mockUser.email,
        },
      };

      mockWebAuthnService.verifyAuthenticationResponse.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/webauthn/auth/finish')
        .send({
          response: {
            id: 'test-credential',
            rawId: 'test-credential',
            response: {
              clientDataJSON: 'test-data',
              authenticatorData: 'test-auth-data',
              signature: 'test-signature',
              userHandle: '',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
          expectedChallenge: 'test-challenge',
        })
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should handle authentication failure', async () => {
      const mockResult = {
        success: false,
        error: 'Authentication failed',
      };

      mockWebAuthnService.verifyAuthenticationResponse.mockResolvedValue(mockResult);

      await request(app)
        .post('/webauthn/auth/finish')
        .send({
          response: {
            id: 'test-credential',
            rawId: 'test-credential',
            response: {
              clientDataJSON: 'test-data',
              authenticatorData: 'test-auth-data',
              signature: 'test-signature',
              userHandle: '',
            },
            type: 'public-key',
            clientExtensionResults: {},
          },
        })
        .expect(401);
    });
  });

  describe('GET /webauthn/devices/:userId', () => {
    it('should return user devices', async () => {
      const mockDevices = [
        {
          id: 'device-1',
          friendly_name: 'iPhone',
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
        },
        {
          id: 'device-2',
          friendly_name: 'MacBook',
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
        },
      ];

      mockWebAuthnService.getUserDevices.mockResolvedValue(mockDevices);

      const response = await request(app)
        .get(`/webauthn/devices/${mockUser.id}`)
        .expect(200);

      expect(response.body).toEqual(mockDevices);
      expect(mockWebAuthnService.getUserDevices).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle empty device list', async () => {
      mockWebAuthnService.getUserDevices.mockResolvedValue([]);

      const response = await request(app)
        .get(`/webauthn/devices/${mockUser.id}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('DELETE /webauthn/devices/:userId/:deviceId', () => {
    it('should remove device successfully', async () => {
      mockWebAuthnService.removeDevice.mockResolvedValue(true);

      const response = await request(app)
        .delete(`/webauthn/devices/${mockUser.id}/device-123`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockWebAuthnService.removeDevice).toHaveBeenCalledWith(mockUser.id, 'device-123');
    });

    it('should handle device removal failure', async () => {
      mockWebAuthnService.removeDevice.mockResolvedValue(false);

      await request(app)
        .delete(`/webauthn/devices/${mockUser.id}/device-123`)
        .expect(404);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockWebAuthnService.generateRegistrationOptions.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/webauthn/register/begin')
        .send({
          userId: mockUser.id,
          userEmail: mockUser.email,
        })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate input parameters', async () => {
      // Test missing userId
      await request(app)
        .post('/webauthn/register/begin')
        .send({
          userEmail: mockUser.email,
        })
        .expect(400);

      // Test missing userEmail
      await request(app)
        .post('/webauthn/register/begin')
        .send({
          userId: mockUser.id,
        })
        .expect(400);
    });
  });
}); 