import { jest } from '@jest/globals';
import { AuthMethod } from '../utils/sybilCalculator.js';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  AuthenticatorAttachment
} from '@simplewebauthn/types';

export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
};

export const mockAuthenticator = {
  id: 'test-authenticator-123',
  credential_id: Buffer.from('test-credential-id'),
  credential_public_key: Buffer.from('test-public-key'),
  counter: 0,
  credential_device_type: 'singleDevice',
  credential_backed_up: false,
  transports: ['usb', 'internal'],
  friendly_name: 'Test Device',
  aaguid: 'test-aaguid',
  last_used_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

export const mockWebAuthnRegistrationResponse: RegistrationResponseJSON = {
  id: 'test-credential',
  rawId: 'test-credential',
  response: {
    clientDataJSON: 'test-data',
    attestationObject: 'test-attestation',
    transports: ['usb', 'internal'] as AuthenticatorTransportFuture[],
  },
  type: 'public-key',
  clientExtensionResults: {},
  authenticatorAttachment: 'platform' as AuthenticatorAttachment,
};

export const mockWebAuthnAuthenticationResponse: AuthenticationResponseJSON = {
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
  authenticatorAttachment: 'platform' as AuthenticatorAttachment,
};

export const mockIDToken = {
  sub: 'test-user-123',
  aud: 'test-client',
  iss: 'https://test.localhost:3000',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: 'test@example.com',
  name: 'Test User',
  did: 'did:nuwa:test',
};

export function createTestIdToken(): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(mockIDToken, process.env['JWT_SECRET'], {
    algorithm: 'HS256',
  });
}

export function createExpiredIdToken(): string {
  const jwt = require('jsonwebtoken');
  const expiredToken = {
    ...mockIDToken,
    exp: Math.floor(Date.now() / 1000) - 3600,
  };
  return jwt.sign(expiredToken, process.env['JWT_SECRET'], {
    algorithm: 'HS256',
  });
}

export function createMockSupabaseClient() {
  return {
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
        listUsers: jest.fn().mockResolvedValue({
          data: { users: [mockUser] },
          error: null,
        }),
        generateLink: jest.fn().mockResolvedValue({
          data: {
            properties: {
              access_token: 'test-token',
              refresh_token: 'test-refresh-token',
            },
          },
          error: null,
        }),
      },
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    update: jest.fn().mockResolvedValue({ data: [], error: null }),
    delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    matchRegex: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

export const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}; 