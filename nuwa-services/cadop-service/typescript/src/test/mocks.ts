import { jest } from '@jest/globals';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

// Mock data for testing
export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
};

export const mockAuthenticator = {
  id: 'auth-123',
  user_id: mockUser.id,
  credential_id: Buffer.from('test-credential-id'),
  credential_public_key: Buffer.from('test-public-key'),
  counter: 0,
  credential_device_type: 'singleDevice',
  credential_backed_up: false,
  transports: ['internal'],
  friendly_name: 'Test Device',
  aaguid: 'test-aaguid',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockDIDCreationRecord = {
  id: 'did-record-123',
  user_id: mockUser.id,
  agent_did: 'did:nuwa:rooch:test123',
  controller_did: 'did:nuwa:test-controller',
  status: 'completed',
  transaction_hash: 'test-tx-hash',
  blockchain_confirmed: true,
  sybil_level: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockIDToken = {
  iss: 'https://test.localhost:3000',
  sub: mockUser.id,
  aud: 'test-client',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: mockUser.email,
  did: 'did:nuwa:test-user',
};

export const mockWebAuthnRegistrationResponse: RegistrationResponseJSON = {
  id: 'test-credential-id',
  rawId: 'test-credential-id',
  response: {
    clientDataJSON: 'test-client-data',
    attestationObject: 'test-attestation',
    transports: ['internal'],
  },
  type: 'public-key',
  clientExtensionResults: {},
};

export const mockWebAuthnAuthenticationResponse: AuthenticationResponseJSON = {
  id: 'test-credential-id',
  rawId: 'test-credential-id',
  response: {
    clientDataJSON: 'test-client-data',
    authenticatorData: 'test-auth-data',
    signature: 'test-signature',
    userHandle: '',
  },
  type: 'public-key',
  clientExtensionResults: {},
};

// Type definitions for mock objects
type MockQueryResult = {
  data: any;
  error: any;
};

type MockQuery = {
  select: jest.MockedFunction<() => MockQuery>;
  insert: jest.MockedFunction<() => MockQuery>;
  update: jest.MockedFunction<() => MockQuery>;
  delete: jest.MockedFunction<() => MockQuery>;
  eq: jest.MockedFunction<() => MockQuery>;
  gt: jest.MockedFunction<() => MockQuery>;
  lt: jest.MockedFunction<() => MockQuery>;
  order: jest.MockedFunction<() => MockQuery>;
  limit: jest.MockedFunction<() => MockQuery>;
  single: jest.MockedFunction<() => MockQueryResult>;
  then: jest.MockedFunction<(callback: (result: MockQueryResult) => any) => any>;
};

// Mock Supabase client
export const createMockSupabaseClient = () => {
  const mockSelectResult: MockQueryResult = {
    data: null,
    error: null,
  };

  const mockQuery: MockQuery = {
    select: jest.fn(() => mockQuery),
    insert: jest.fn(() => mockQuery),
    update: jest.fn(() => mockQuery),
    delete: jest.fn(() => mockQuery),
    eq: jest.fn(() => mockQuery),
    gt: jest.fn(() => mockQuery),
    lt: jest.fn(() => mockQuery),
    order: jest.fn(() => mockQuery),
    limit: jest.fn(() => mockQuery),
    single: jest.fn(() => mockSelectResult),
    then: jest.fn((callback: (result: MockQueryResult) => any) => callback(mockSelectResult)),
  };

  return {
    from: jest.fn(() => mockQuery),
    rpc: jest.fn(() => mockQuery),
    channel: jest.fn(() => ({
      on: jest.fn(() => ({
        subscribe: jest.fn(),
      })),
    })),
  };
};

// Mock @nuwa-identity-kit
export const createMockNuwaIdentityKit = () => ({
  createDID: jest.fn(),
  resolveDID: jest.fn(),
  signVC: jest.fn(),
  verifyVC: jest.fn(),
});

// Mock @simplewebauthn/server
export const mockWebAuthnServer = {
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
};

// Mock logger
export const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Test utilities
export const createTestIdToken = (payload: Partial<typeof mockIDToken> = {}) => {
  const jwt = require('jsonwebtoken');
  const testPayload = { ...mockIDToken, ...payload };
  return jwt.sign(testPayload, process.env['JWT_SECRET'] || 'test-jwt-secret', {
    algorithm: 'HS256',
  });
};

export const createExpiredIdToken = () => {
  const jwt = require('jsonwebtoken');
  const expiredPayload = {
    ...mockIDToken,
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  };
  return jwt.sign(expiredPayload, process.env['JWT_SECRET'] || 'test-jwt-secret', {
    algorithm: 'HS256',
  });
}; 