import { validateIdToken, createIdToken, decodeIdToken } from '../oidcService';
import { createTestIdToken, createExpiredIdToken, mockIDToken } from '../../test/mocks';

// Set up test environment
process.env['JWT_SECRET'] = 'test-jwt-secret-for-testing';
process.env['OIDC_ISSUER'] = 'https://test.localhost:3000';

describe('OIDC Service', () => {
  describe('validateIdToken', () => {
    it('should validate a valid ID token', async () => {
      const validToken = createTestIdToken();
      const result = await validateIdToken(validToken);

      expect(result).toBeTruthy();
      expect(result?.sub).toBe(mockIDToken.sub);
      expect(result?.aud).toBe(mockIDToken.aud);
      expect(result?.email).toBe(mockIDToken.email);
    });

    it('should reject an expired ID token', async () => {
      const expiredToken = createExpiredIdToken();
      const result = await validateIdToken(expiredToken);

      expect(result).toBeNull();
    });

    it('should reject an empty token', async () => {
      const result = await validateIdToken('');

      expect(result).toBeNull();
    });

    it('should reject a malformed token', async () => {
      const result = await validateIdToken('invalid.token.here');

      expect(result).toBeNull();
    });

    it('should reject a token with wrong signature', async () => {
      const jwt = require('jsonwebtoken');
      const tokenWithWrongSignature = jwt.sign(mockIDToken, 'wrong-secret', {
        algorithm: 'HS256',
      });

      const result = await validateIdToken(tokenWithWrongSignature);

      expect(result).toBeNull();
    });

    it('should reject a token without required sub claim', async () => {
      const jwt = require('jsonwebtoken');
      const payloadWithoutSub = { ...mockIDToken } as any;
      delete payloadWithoutSub.sub;
      const tokenWithoutSub = jwt.sign(payloadWithoutSub, process.env['JWT_SECRET'], {
        algorithm: 'HS256',
      });
      
      const result = await validateIdToken(tokenWithoutSub);

      expect(result).toBeNull();
    });

    it('should reject a token without required aud claim', async () => {
      const jwt = require('jsonwebtoken');
      const payloadWithoutAud = { ...mockIDToken } as any;
      delete payloadWithoutAud.aud;
      const tokenWithoutAud = jwt.sign(payloadWithoutAud, process.env['JWT_SECRET'], {
        algorithm: 'HS256',
      });
      
      const result = await validateIdToken(tokenWithoutAud);

      expect(result).toBeNull();
    });

    it('should handle missing JWT_SECRET gracefully', async () => {
      const originalSecret = process.env['JWT_SECRET'];
      delete process.env['JWT_SECRET'];

      const validToken = createTestIdToken();
      const result = await validateIdToken(validToken);

      expect(result).toBeNull();

      // Restore environment
      process.env['JWT_SECRET'] = originalSecret;
    });
  });

  describe('createIdToken', () => {
    it('should create a valid ID token with default values', () => {
      const token = createIdToken({});

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Decode and verify structure
      const decoded = decodeIdToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded?.iss).toBe(process.env['OIDC_ISSUER']);
      expect(decoded?.sub).toBe('test-user');
      expect(decoded?.aud).toBe('default-client');
    });

    it('should create a token with custom payload', () => {
      const customPayload = {
        sub: 'custom-user-123',
        aud: 'custom-client',
        email: 'custom@example.com',
        did: 'did:nuwa:custom',
      };

      const token = createIdToken(customPayload);
      const decoded = decodeIdToken(token);

      expect(decoded?.sub).toBe(customPayload.sub);
      expect(decoded?.aud).toBe(customPayload.aud);
      expect(decoded?.email).toBe(customPayload.email);
      expect(decoded?.did).toBe(customPayload.did);
    });

    it('should throw error when JWT_SECRET is missing', () => {
      const originalSecret = process.env['JWT_SECRET'];
      delete process.env['JWT_SECRET'];

      expect(() => {
        createIdToken({});
      }).toThrow('JWT_SECRET not configured');

      // Restore environment
      process.env['JWT_SECRET'] = originalSecret;
    });

    it('should create token with correct expiration time', () => {
      const token = createIdToken({});
      const decoded = decodeIdToken(token);

      expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(decoded?.exp).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000) + 3600 + 10 // Allow 10 seconds tolerance
      );
    });
  });

  describe('decodeIdToken', () => {
    it('should decode a valid token without verification', () => {
      const token = createTestIdToken();
      const decoded = decodeIdToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.sub).toBe(mockIDToken.sub);
      expect(decoded?.aud).toBe(mockIDToken.aud);
    });

    it('should decode an expired token without error', () => {
      const expiredToken = createExpiredIdToken();
      const decoded = decodeIdToken(expiredToken);

      expect(decoded).toBeTruthy();
      expect(decoded?.sub).toBe(mockIDToken.sub);
    });

    it('should return null for malformed token', () => {
      const result = decodeIdToken('invalid.token');

      expect(result).toBeNull();
    });

    it('should return null for empty token', () => {
      const result = decodeIdToken('');

      expect(result).toBeNull();
    });
  });
}); 