import { describe, it, expect } from '@jest/globals';
import { DIDKeyManager } from '../did-key-manager.js';
import { Buffer } from 'buffer';
import { base64urlpad } from 'multiformats/bases/base64';

describe('DIDKeyManager', () => {
  describe('generateDIDFromEd25519PublicKey', () => {
    it('should generate correct did:key from Ed25519 public key', () => {
      // Ed25519 测试公钥（32字节）
      const publicKey = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0
      ]);

      const did = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey.buffer);

      // 验证 DID 格式
      expect(did).toMatch(/^did:key:z[1-9a-km-zA-HJ-NP-Z]+$/);
      
      // 验证 DID 长度（Ed25519 公钥的 did:key 应该有固定长度）
      // did:key:z 前缀(8) + base58编码的 multicodec+公钥(约44-48字符)
      expect(did.length).toBeGreaterThan(50);
      expect(did.length).toBeLessThan(57);

      console.log('Generated DID:', did);
    });

    it('should generate consistent DIDs for the same public key', () => {
      const publicKey = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0
      ]);

      const did1 = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey.buffer);
      const did2 = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey.buffer);

      expect(did1).toBe(did2);
    });

    it('should generate different DIDs for different public keys', () => {
      const publicKey1 = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0
      ]);

      const publicKey2 = new Uint8Array([
        0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12,
        0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12,
        0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12,
        0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12
      ]);

      const did1 = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey1.buffer);
      const did2 = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey2.buffer);

      expect(did1).not.toBe(did2);
    });

    it('should reject invalid public key length', () => {
      const invalidPublicKey = new Uint8Array([1, 2, 3]); // 太短

      expect(() =>
        DIDKeyManager.generateDIDFromEd25519PublicKey(invalidPublicKey.buffer)
      ).toThrow('Invalid Ed25519 public key: must be 32 bytes');
    });
  });

  describe('validateDIDKey', () => {
    it('should validate a correctly generated DID', async () => {
      const publicKey = new Uint8Array(32).fill(1); // 32字节的公钥
      const did = DIDKeyManager.generateDIDFromEd25519PublicKey(publicKey.buffer);

      // 创建对应的 JWK
      const jwk: JsonWebKey = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64urlpad.encode(publicKey),
        alg: 'EdDSA',
        use: 'sig'
      };

      console.log('Testing DID validation:', {
        did,
        jwk,
        publicKeyHex: Buffer.from(publicKey).toString('hex')
      });

      const isValid = await DIDKeyManager.validateDIDKey(did, jwk);
      expect(isValid).toBe(true);
    });

    it('should reject invalid DID format', async () => {
      const jwk: JsonWebKey = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64urlpad.encode(new Uint8Array(32).fill(0)),
        alg: 'EdDSA',
        use: 'sig'
      };

      const isValid = await DIDKeyManager.validateDIDKey('invalid:did', jwk);
      expect(isValid).toBe(false);
    });
  });
}); 