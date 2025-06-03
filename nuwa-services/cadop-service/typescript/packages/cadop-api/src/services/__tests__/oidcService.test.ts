import * as jwt from 'jsonwebtoken';
import { validateIdToken, createIdToken, decodeIdToken, verifyIdToken } from '../oidc.js';
import { createTestIdToken, createExpiredIdToken, mockIDToken } from '../../test/mocks.js';
import { oidcService } from '../oidc.js';
import { logger } from '../../utils/logger.js';

// Set up test environment
const JWT_SECRET = 'test-jwt-secret-for-testing';
process.env['JWT_SECRET'] = JWT_SECRET;
process.env['OIDC_ISSUER'] = 'https://test.localhost:3000';

const testIDToken = {
  iss: 'https://cadop.example.com',
  sub: 'user123',
  aud: 'client123',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: 'test@example.com',
  email_verified: true,
  did: 'did:key:123',
  agent_did: 'did:rooch:456',
  sybil_level: 2,
  auth_methods: ['passkey', 'email']
};

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
      const tokenWithWrongSignature = jwt.sign(mockIDToken, 'wrong-secret', {
        algorithm: 'HS256',
      });

      const result = await validateIdToken(tokenWithWrongSignature);

      expect(result).toBeNull();
    });

    it('should reject a token without required sub claim', async () => {
      const payloadWithoutSub = { ...mockIDToken } as any;
      delete payloadWithoutSub.sub;
      const tokenWithoutSub = jwt.sign(payloadWithoutSub, JWT_SECRET, {
        algorithm: 'HS256',
      });
      
      const result = await validateIdToken(tokenWithoutSub);

      expect(result).toBeNull();
    });

    it('should reject a token without required aud claim', async () => {
      const payloadWithoutAud = { ...mockIDToken } as any;
      delete payloadWithoutAud.aud;
      const tokenWithoutAud = jwt.sign(payloadWithoutAud, JWT_SECRET, {
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
    it('should create a valid ID token with default values', async () => {
      const token = await createIdToken({});

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Decode and verify structure
      const decoded = decodeIdToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded?.iss).toBe(process.env['OIDC_ISSUER']);
      expect(decoded?.sub).toBe('test-user');
      expect(decoded?.aud).toBe('default-client');
    });

    it('should create a token with custom payload', async () => {
      const customPayload = {
        sub: 'custom-user-123',
        aud: 'custom-client',
        email: 'custom@example.com',
        did: 'did:nuwa:custom',
      };

      const token = await createIdToken(customPayload);
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

    it('should create token with correct expiration time', async () => {
      const token = await createIdToken({});
      const decoded = decodeIdToken(token);

      expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(decoded?.exp).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000) + 3600 + 10 // Allow 10 seconds tolerance
      );
    });
  });

  describe('decodeIdToken', () => {
    it('should decode a valid ID token', () => {
      // 创建一个有效的 ID token
      const token = jwt.sign(testIDToken, 'test-secret');
      
      // 解码 token
      const result = decodeIdToken(token);
      
      // 验证结果
      expect(result).toBeDefined();
      expect(result?.sub).toBe(testIDToken.sub);
      expect(result?.email).toBe(testIDToken.email);
      expect(result?.did).toBe(testIDToken.did);
    });

    it('should return null for an invalid token', () => {
      const result = decodeIdToken('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe('verifyIdToken', () => {
    it('should verify a valid ID token', async () => {
      // 创建一个有效的 ID token
      const token = jwt.sign(mockIDToken, JWT_SECRET);
      
      // 验证 token
      const result = await verifyIdToken(token);
      
      // 验证结果
      expect(result).toBeDefined();
      expect(result?.sub).toBe(mockIDToken.sub);
      expect(result?.email).toBe(mockIDToken.email);
      expect(result?.did).toBe(mockIDToken.did);
    });

    it('should throw error for an invalid token', async () => {
      await expect(verifyIdToken('invalid-token')).rejects.toThrow();
    });
  });
}); 