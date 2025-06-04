import { jest } from '@jest/globals';
import { AuthMethod } from '../utils/sybilCalculator.js';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  AuthenticatorAttachment
} from '@simplewebauthn/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../config/supabase.js';
import jsonwebtoken from 'jsonwebtoken';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import * as crypto from 'crypto';
import { encode } from 'cbor2';

// 使用固定的种子生成密钥对
const seed = Buffer.from('test-seed-for-consistent-key-generation');
const credentialId = crypto.createHash('sha256').update(seed).digest().slice(0, 32);

// 生成一个真实的 ECDSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: {
    type: 'spki',
    format: 'der'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'der'
  }
});

// 从 DER 格式中提取原始公钥
const asn1PublicKey = crypto.createPublicKey({
  key: publicKey,
  format: 'der',
  type: 'spki'
});
const rawPublicKey = asn1PublicKey.export({
  format: 'der',
  type: 'spki'
});

// 提取 x 和 y 坐标
const xCoord = rawPublicKey.slice(27, 59);
const yCoord = rawPublicKey.slice(59, 91);

// 创建 COSE 格式的公钥
const cosePublicKey = new Map();
cosePublicKey.set(1, 2); // kty: EC2
cosePublicKey.set(3, -7); // alg: ES256
cosePublicKey.set(-1, 1); // crv: P-256
cosePublicKey.set(-2, xCoord); // x coordinate
cosePublicKey.set(-3, yCoord); // y coordinate

// 创建一个有效的 authenticator data（不包含 attestedCredentialData）
const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
const flags = new Uint8Array([0b01000101]); // UP=1, UV=1, BE=1
const signCount = new Uint8Array(4);

// 简化的 authenticator data（用于认证）
const simpleAuthenticatorData = new Uint8Array([
  ...new Uint8Array(rpIdHash),     // 32 bytes
  ...flags,                        // 1 byte
  ...signCount,                    // 4 bytes
]);
// 总共 37 bytes

// 完整的 authenticator data（用于注册，包含 attestedCredentialData）
const aaguid = new Uint8Array(16);
const credentialIdLength = new Uint8Array([0, 32]); // 32 bytes

const authenticatorData = new Uint8Array([
  ...new Uint8Array(rpIdHash),
  ...flags,
  ...signCount,
  ...aaguid,
  ...credentialIdLength,
  ...new Uint8Array(credentialId),
  ...new Uint8Array(encode(cosePublicKey))
]);

export const mockUser = {
  id: '4b371138-a604-4413-9359-bd862a12cfef',
  email: 'test@example.com',
  name: 'Test User',
};

export const mockAuthenticator = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: mockUser.id,
  credential_id: isoBase64URL.fromBuffer(credentialId),
  credential_public_key: Buffer.from(encode(cosePublicKey)).toString('hex'),
  counter: 0,
  credential_device_type: 'singleDevice',
  credential_backed_up: true,
  transports: ['usb', 'internal'] as AuthenticatorTransportFuture[],
  friendly_name: 'Test Device',
  aaguid: '00000000-0000-0000-0000-000000000000',
  last_used_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

export const createMockRegistrationResponse = (challenge: string): RegistrationResponseJSON => ({
  id: mockAuthenticator.credential_id,
  rawId: mockAuthenticator.credential_id,
  response: {
    attestationObject: isoBase64URL.fromBuffer(encode({
      fmt: 'none',
      attStmt: {},
      authData: authenticatorData
    })),
    clientDataJSON: isoBase64URL.fromBuffer(Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: challenge,
      origin: 'http://localhost:3000',
    }))),
    transports: ['usb', 'internal'] as AuthenticatorTransportFuture[],
  },
  type: 'public-key',
  clientExtensionResults: {},
  authenticatorAttachment: 'platform' as const,
});

export const createMockAuthenticationResponse = (challenge: string): AuthenticationResponseJSON => {
  // 创建签名数据
  const clientDataJSON = {
    type: 'webauthn.get',
    challenge: challenge,
    origin: 'http://localhost:3000',
  };
  const clientDataJSONBytes = Buffer.from(JSON.stringify(clientDataJSON));
  const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBytes).digest();
  
  // 使用简化的 authenticator data（认证时不包含 attestedCredentialData）
  const signatureBase = Buffer.concat([simpleAuthenticatorData, clientDataHash]);
  
  // 使用 ES256 算法签名
  const sign = crypto.createSign('SHA256');
  sign.update(signatureBase);
  const signature = sign.sign({
    key: privateKey,
    format: 'der',
    type: 'pkcs8'
  });

  return {
    id: mockAuthenticator.credential_id,
    rawId: mockAuthenticator.credential_id,
    response: {
      authenticatorData: isoBase64URL.fromBuffer(simpleAuthenticatorData),
      clientDataJSON: isoBase64URL.fromBuffer(clientDataJSONBytes),
      signature: isoBase64URL.fromBuffer(signature),
      userHandle: mockUser.id,
    },
    type: 'public-key',
    clientExtensionResults: {},
    authenticatorAttachment: 'platform' as const,
  };
};

export const mockIDToken = {
  sub: mockUser.id,
  aud: 'test-client',
  iss: 'https://test.localhost:3000',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  email: 'test@example.com',
  name: 'Test User',
  did: 'did:nuwa:test',
};

export function createTestIdToken(): string {
  return jsonwebtoken.sign(mockIDToken, process.env['JWT_SECRET'] || 'test-secret', {
    algorithm: 'HS256',
  });
}

export function createExpiredIdToken(): string {
  const expiredToken = {
    ...mockIDToken,
    exp: Math.floor(Date.now() / 1000) - 3600,
  };
  return jsonwebtoken.sign(expiredToken, process.env['JWT_SECRET'] || 'test-secret', {
    algorithm: 'HS256',
  });
}

