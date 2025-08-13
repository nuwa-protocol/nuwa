import { describe, it, expect, beforeEach } from '@jest/globals';
import { StoredKeyCodec } from '../../src/keys/StoredKeyCodec';
import { StoredKey } from '../../src/keys/KeyStore';
import { KeyType } from '../../src/types/crypto';
import { CryptoUtils } from '../../src/crypto/utils';
import { MultibaseCodec } from '../../src/multibase';

describe('StoredKeyCodec', () => {
  let testStoredKey: StoredKey;

  beforeEach(async () => {
    // Generate a real key pair for testing
    const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
    testStoredKey = {
      keyId: 'did:example:123#key-1',
      keyType: KeyType.ED25519,
      publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
      privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      meta: {
        created: '2023-01-01T00:00:00Z',
        purpose: 'authentication',
      },
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
        privateKeyMultibase: testStoredKey.privateKeyMultibase,
      };

      const encoded = StoredKeyCodec.encode(keyWithoutMeta);
      expect(encoded).toMatch(/^z/);
    });

    it('should encode StoredKey without private key', () => {
      const publicKeyOnly: StoredKey = {
        keyId: testStoredKey.keyId,
        keyType: testStoredKey.keyType,
        publicKeyMultibase: testStoredKey.publicKeyMultibase,
      };

      const encoded = StoredKeyCodec.encode(publicKeyOnly);
      expect(encoded).toMatch(/^z/);
    });
  });

  describe('decode', () => {
    it('should decode a base58btc string back to the original StoredKey', async () => {
      const encoded = StoredKeyCodec.encode(testStoredKey);
      const decoded = await StoredKeyCodec.decode(encoded);

      expect(decoded).toEqual(testStoredKey);
    });

    it('should preserve all properties during round-trip encoding/decoding', async () => {
      const encoded = StoredKeyCodec.encode(testStoredKey);
      const decoded = await StoredKeyCodec.decode(encoded);

      expect(decoded.keyId).toBe(testStoredKey.keyId);
      expect(decoded.keyType).toBe(testStoredKey.keyType);
      expect(decoded.publicKeyMultibase).toBe(testStoredKey.publicKeyMultibase);
      expect(decoded.privateKeyMultibase).toBe(testStoredKey.privateKeyMultibase);
      expect(decoded.meta).toEqual(testStoredKey.meta);
    });

    it('should handle different KeyType values', async () => {
      // Generate a real Secp256k1 key pair for testing
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const secp256k1Key: StoredKey = {
        ...testStoredKey,
        keyType: KeyType.SECP256K1,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      };

      const encoded = StoredKeyCodec.encode(secp256k1Key);
      const decoded = await StoredKeyCodec.decode(encoded);

      expect(decoded.keyType).toBe(KeyType.SECP256K1);
    });

    it('should throw error for invalid base58btc string', async () => {
      await expect(StoredKeyCodec.decode('invalid-string')).rejects.toThrow();
    });

    it('should throw error for malformed JSON', async () => {
      // Create a valid base58btc string but with invalid JSON content
      const invalidJson = 'z' + 'InvalidJsonContent';

      await expect(StoredKeyCodec.decode(invalidJson)).rejects.toThrow();
    });
  });

  describe('round-trip consistency', () => {
    it('should maintain data integrity through multiple encode/decode cycles', async () => {
      let current = testStoredKey;

      // Perform multiple encode/decode cycles
      for (let i = 0; i < 5; i++) {
        const encoded = StoredKeyCodec.encode(current);
        current = await StoredKeyCodec.decode(encoded);
      }

      expect(current).toEqual(testStoredKey);
    });

    it('should handle various special characters in metadata', async () => {
      const keyWithSpecialMeta: StoredKey = {
        ...testStoredKey,
        meta: {
          description: 'Key with special chars: éñ中文🔑',
          tags: ['test', 'special-chars', 'unicode'],
          numbers: [1, 2, 3.14],
          nested: {
            level1: {
              level2: 'deep value',
            },
          },
        },
      };

      const encoded = StoredKeyCodec.encode(keyWithSpecialMeta);
      const decoded = await StoredKeyCodec.decode(encoded);

      expect(decoded).toEqual(keyWithSpecialMeta);
    });
  });

  describe('key consistency validation', () => {
    it('should validate consistent Ed25519 key pairs', async () => {
      // Generate a real key pair for testing
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const testKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ED25519,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      };

      const encoded = StoredKeyCodec.encode(testKey);
      const decoded = await StoredKeyCodec.decode(encoded);
      expect(decoded).toEqual(testKey);
    });

    it('should validate consistent Secp256k1 key pairs', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const testKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.SECP256K1,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      };

      const encoded = StoredKeyCodec.encode(testKey);
      const decoded = await StoredKeyCodec.decode(encoded);
      expect(decoded).toEqual(testKey);
    });

    it('should validate consistent EcdsaR1 key pairs', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const testKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ECDSAR1,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      };

      const encoded = StoredKeyCodec.encode(testKey);
      const decoded = await StoredKeyCodec.decode(encoded);
      expect(decoded).toEqual(testKey);
    });

    it('should detect inconsistent key pairs', async () => {
      // Generate two different key pairs
      const keyPair1 = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const keyPair2 = await CryptoUtils.generateKeyPair(KeyType.ED25519);

      // Mix private key from one pair with public key from another
      const inconsistentKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ED25519,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair1.publicKey),
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair2.privateKey),
      };

      const encoded = StoredKeyCodec.encode(inconsistentKey);

      await expect(StoredKeyCodec.decode(encoded)).rejects.toThrow(
        'StoredKey validation failed: private and public keys are inconsistent'
      );
    });

    it('should skip validation when private key is missing', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const publicKeyOnlyKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ED25519,
        publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
        // No privateKeyMultibase
      };

      const encoded = StoredKeyCodec.encode(publicKeyOnlyKey);
      const decoded = await StoredKeyCodec.decode(encoded);
      expect(decoded).toEqual(publicKeyOnlyKey);
    });

    it('should skip validation when public key is missing', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const privateKeyOnlyKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ED25519,
        publicKeyMultibase: '', // Empty string to simulate missing public key
        privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
      };

      const encoded = StoredKeyCodec.encode(privateKeyOnlyKey);
      const decoded = await StoredKeyCodec.decode(encoded);
      expect(decoded).toEqual(privateKeyOnlyKey);
    });

    it('should handle validation errors gracefully', async () => {
      const invalidKey: StoredKey = {
        keyId: 'did:example:123#key-1',
        keyType: KeyType.ED25519,
        publicKeyMultibase: 'z-invalid-multibase',
        privateKeyMultibase: 'z-invalid-multibase',
      };

      const encoded = StoredKeyCodec.encode(invalidKey);

      await expect(StoredKeyCodec.decode(encoded)).rejects.toThrow(
        'StoredKey validation failed: private and public keys are inconsistent'
      );
    });
  });
});
