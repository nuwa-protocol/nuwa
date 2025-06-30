import { describe, it, expect } from '@jest/globals';
import { KeyMultibaseCodec, MultibaseCodec } from '../../src/multibase';
import { KEY_TYPE } from '../../src/types';
import { Bytes } from '../../src/utils/bytes';

describe('KeyMultibaseCodec', () => {
  describe('Ed25519 keys', () => {
    it('should encode and decode Ed25519 key correctly', () => {
      const testKey = new Uint8Array(32).fill(1); // 32 bytes for Ed25519
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.ED25519);

      // Should start with 'z' (base58btc prefix)
      expect(encoded).toMatch(/^z/);

      const decoded = KeyMultibaseCodec.decodeWithType(encoded);
      expect(decoded.keyType).toBe(KEY_TYPE.ED25519);
      expect(decoded.bytes).toEqual(testKey);
    });

    it('should handle minimum length Ed25519 key', () => {
      const testKey = new Uint8Array(32); // Empty 32 bytes
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.ED25519);
      const decoded = KeyMultibaseCodec.decodeWithType(encoded);
      expect(decoded.keyType).toBe(KEY_TYPE.ED25519);
      expect(decoded.bytes).toEqual(testKey);
    });
  });

  describe('Secp256k1 keys', () => {
    it('should encode and decode Secp256k1 key correctly', () => {
      const testKey = new Uint8Array(33).fill(2); // 33 bytes for compressed Secp256k1
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.SECP256K1);

      // Should start with 'z' (base58btc prefix)
      expect(encoded).toMatch(/^z/);

      const decoded = KeyMultibaseCodec.decodeWithType(encoded);
      expect(decoded.keyType).toBe(KEY_TYPE.SECP256K1);
      expect(decoded.bytes).toEqual(testKey);
    });

    it('should handle minimum length Secp256k1 key', () => {
      const testKey = new Uint8Array(33); // Empty 33 bytes
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.SECP256K1);
      const decoded = KeyMultibaseCodec.decodeWithType(encoded);
      expect(decoded.keyType).toBe(KEY_TYPE.SECP256K1);
      expect(decoded.bytes).toEqual(testKey);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported key type', () => {
      const testKey = new Uint8Array(32);
      expect(() => {
        KeyMultibaseCodec.encodeWithType(testKey, 'UnsupportedType' as any);
      }).toThrow('Unsupported key type');
    });

    it('should throw error for invalid multibase format', () => {
      expect(() => {
        KeyMultibaseCodec.decodeWithType('invalid-format');
      }).toThrow();
    });

    it('should throw error for unknown key type prefix', () => {
      // Create a valid base58btc string with invalid key type prefix
      const testKey = new Uint8Array(34); // 2 bytes prefix + 32 bytes key
      testKey[0] = 0xff; // Invalid prefix
      testKey[1] = 0xff; // Invalid prefix
      testKey.set(new Uint8Array(32).fill(1), 2); // Valid key data
      const encoded = MultibaseCodec.encodeBase58btc(testKey);

      expect(() => {
        KeyMultibaseCodec.decodeWithType(encoded);
      }).toThrow('Unknown key type prefix');
    });
  });

  describe('Multicodec prefixes', () => {
    it('should add correct prefix for Ed25519', () => {
      const testKey = new Uint8Array(32).fill(1);
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.ED25519);
      const decoded = KeyMultibaseCodec.decodeWithType(encoded);

      // First two bytes should be Ed25519 prefix (0xed01)
      const rawDecoded = Bytes.bytesToString(decoded.bytes);
      expect(decoded.keyType).toBe(KEY_TYPE.ED25519);
      expect(rawDecoded.length).toBe(32); // Original key length
    });

    it('should add correct prefix for Secp256k1', () => {
      const testKey = new Uint8Array(33).fill(2);
      const encoded = KeyMultibaseCodec.encodeWithType(testKey, KEY_TYPE.SECP256K1);
      const decoded = KeyMultibaseCodec.decodeWithType(encoded);

      // First two bytes should be Secp256k1 prefix (0xe701)
      const rawDecoded = Bytes.bytesToString(decoded.bytes);
      expect(decoded.keyType).toBe(KEY_TYPE.SECP256K1);
      expect(rawDecoded.length).toBe(33); // Original key length
    });
  });
});
