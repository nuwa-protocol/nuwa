import { describe, it, expect, beforeEach } from '@jest/globals';
import { StoredKeyCodec } from '../../src/keys/StoredKeyCodec';
import { StoredKey } from '../../src/keys/KeyStore';
import { KeyType } from '../../src/types/crypto';

describe('StoredKeyCodec', () => {
  let testStoredKey: StoredKey;

  beforeEach(() => {
    testStoredKey = {
      keyId: 'did:example:123#key-1',
      keyType: KeyType.ED25519,
      publicKeyMultibase: 'z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
      privateKeyMultibase: 'z3u2HNqP6b5gqBCT7vdPkxX4rY8QRJl1KcSMZ9p7b6vRsA8W',
      meta: {
        created: '2023-01-01T00:00:00Z',
        purpose: 'authentication'
      }
    };
  });

  describe('encode', () => {
    it('should encode a StoredKey to a base58btc string', () => {
      const encoded = StoredKeyCodec.encode(testStoredKey);
      
      // Should start with 'z' (base58btc prefix)
      expect(encoded).toMatch(/^z/);
      
      // Should be a non-empty string
      expect(encoded.length).toBeGreaterThan(1);
    });

    it('should encode StoredKey without meta property', () => {
      const keyWithoutMeta: StoredKey = {
        keyId: testStoredKey.keyId,
        keyType: testStoredKey.keyType,
        publicKeyMultibase: testStoredKey.publicKeyMultibase,
        privateKeyMultibase: testStoredKey.privateKeyMultibase
      };

      const encoded = StoredKeyCodec.encode(keyWithoutMeta);
      expect(encoded).toMatch(/^z/);
    });

    it('should encode StoredKey without private key', () => {
      const publicKeyOnly: StoredKey = {
        keyId: testStoredKey.keyId,
        keyType: testStoredKey.keyType,
        publicKeyMultibase: testStoredKey.publicKeyMultibase
      };

      const encoded = StoredKeyCodec.encode(publicKeyOnly);
      expect(encoded).toMatch(/^z/);
    });
  });

  describe('decode', () => {
    it('should decode a base58btc string back to the original StoredKey', () => {
      const encoded = StoredKeyCodec.encode(testStoredKey);
      const decoded = StoredKeyCodec.decode(encoded);

      expect(decoded).toEqual(testStoredKey);
    });

    it('should preserve all properties during round-trip encoding/decoding', () => {
      const encoded = StoredKeyCodec.encode(testStoredKey);
      const decoded = StoredKeyCodec.decode(encoded);

      expect(decoded.keyId).toBe(testStoredKey.keyId);
      expect(decoded.keyType).toBe(testStoredKey.keyType);
      expect(decoded.publicKeyMultibase).toBe(testStoredKey.publicKeyMultibase);
      expect(decoded.privateKeyMultibase).toBe(testStoredKey.privateKeyMultibase);
      expect(decoded.meta).toEqual(testStoredKey.meta);
    });

    it('should handle different KeyType values', () => {
      const secp256k1Key: StoredKey = {
        ...testStoredKey,
        keyType: KeyType.SECP256K1
      };

      const encoded = StoredKeyCodec.encode(secp256k1Key);
      const decoded = StoredKeyCodec.decode(encoded);

      expect(decoded.keyType).toBe(KeyType.SECP256K1);
    });

    it('should throw error for invalid base58btc string', () => {
      expect(() => {
        StoredKeyCodec.decode('invalid-string');
      }).toThrow();
    });

    it('should throw error for malformed JSON', () => {
      // Create a valid base58btc string but with invalid JSON content
      const invalidJson = 'z' + 'InvalidJsonContent';
      
      expect(() => {
        StoredKeyCodec.decode(invalidJson);
      }).toThrow();
    });
  });

  describe('round-trip consistency', () => {
    it('should maintain data integrity through multiple encode/decode cycles', () => {
      let current = testStoredKey;
      
      // Perform multiple encode/decode cycles
      for (let i = 0; i < 5; i++) {
        const encoded = StoredKeyCodec.encode(current);
        current = StoredKeyCodec.decode(encoded);
      }
      
      expect(current).toEqual(testStoredKey);
    });

    it('should handle various special characters in metadata', () => {
      const keyWithSpecialMeta: StoredKey = {
        ...testStoredKey,
        meta: {
          description: 'Key with special chars: éñ中文🔑',
          tags: ['test', 'special-chars', 'unicode'],
          numbers: [1, 2, 3.14],
          nested: {
            level1: {
              level2: 'deep value'
            }
          }
        }
      };

      const encoded = StoredKeyCodec.encode(keyWithSpecialMeta);
      const decoded = StoredKeyCodec.decode(encoded);

      expect(decoded).toEqual(keyWithSpecialMeta);
    });
  });
}); 