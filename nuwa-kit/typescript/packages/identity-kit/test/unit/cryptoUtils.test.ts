import { describe, it, expect } from '@jest/globals';
import { CryptoUtils } from '../../src/crypto';
import { KeyType } from '../../src/types';

describe('CryptoUtils', () => {
  describe('generateKeyPair', () => {
    it('should generate Ed25519 key pair by default', async () => {
      const keyPair = await CryptoUtils.generateKeyPair();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate Ed25519 key pair explicitly', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate Secp256k1 key pair', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate ECDSAR1 key pair', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should throw error for invalid key type', async () => {
      await expect(CryptoUtils.generateKeyPair('invalid-type' as any)).rejects.toThrow(
        'Invalid key type'
      );
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify with Ed25519', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const data = new TextEncoder().encode('test message');

      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ED25519);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KeyType.ED25519);
      expect(isValid).toBe(true);
    });

    it('should sign and verify with Secp256k1', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const data = new TextEncoder().encode('test message');

      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.SECP256K1);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(
        data,
        signature,
        keyPair.publicKey,
        KeyType.SECP256K1
      );
      expect(isValid).toBe(true);
    });

    it('should sign and verify with ECDSAR1', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const data = new TextEncoder().encode('test message');

      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ECDSAR1);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KeyType.ECDSAR1);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', async () => {
      const keyPair1 = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const keyPair2 = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const data = new TextEncoder().encode('test message');

      const signature = await CryptoUtils.sign(data, keyPair1.privateKey, KeyType.ED25519);
      const isValid = await CryptoUtils.verify(
        data,
        signature,
        keyPair2.publicKey,
        KeyType.ED25519
      );
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered data', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const data = new TextEncoder().encode('test message');
      const tamperedData = new TextEncoder().encode('tampered message');

      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ED25519);
      const isValid = await CryptoUtils.verify(
        tamperedData,
        signature,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isValid).toBe(false);
    });
  });

  describe('key type conversion', () => {
    it('should handle string key type input', async () => {
      const keyPair = await CryptoUtils.generateKeyPair('Ed25519VerificationKey2020');
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should handle both string and enum key types consistently', async () => {
      const stringKeyPair = await CryptoUtils.generateKeyPair('Ed25519VerificationKey2020');
      const enumKeyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);

      const data = new TextEncoder().encode('test message');

      // Cross-verify signatures
      const stringSignature = await CryptoUtils.sign(
        data,
        stringKeyPair.privateKey,
        'Ed25519VerificationKey2020'
      );
      const enumSignature = await CryptoUtils.sign(data, enumKeyPair.privateKey, KeyType.ED25519);

      const isValidString = await CryptoUtils.verify(
        data,
        stringSignature,
        stringKeyPair.publicKey,
        KeyType.ED25519
      );
      const isValidEnum = await CryptoUtils.verify(
        data,
        enumSignature,
        enumKeyPair.publicKey,
        'Ed25519VerificationKey2020'
      );

      expect(isValidString).toBe(true);
      expect(isValidEnum).toBe(true);
    });
  });

  describe('validateKeyPairConsistency', () => {
    it('should validate consistent Ed25519 key pairs', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        keyPair.privateKey,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isConsistent).toBe(true);
    });

    it('should validate consistent Secp256k1 key pairs', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        keyPair.privateKey,
        keyPair.publicKey,
        KeyType.SECP256K1
      );
      expect(isConsistent).toBe(true);
    });

    it('should validate consistent EcdsaR1 key pairs', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        keyPair.privateKey,
        keyPair.publicKey,
        KeyType.ECDSAR1
      );
      expect(isConsistent).toBe(true);
    });

    it('should detect inconsistent key pairs', async () => {
      const keyPair1 = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const keyPair2 = await CryptoUtils.generateKeyPair(KeyType.ED25519);

      // Mix private key from one pair with public key from another
      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        keyPair1.privateKey,
        keyPair2.publicKey,
        KeyType.ED25519
      );
      expect(isConsistent).toBe(false);
    });

    it('should work with different key types using string format', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        keyPair.privateKey,
        keyPair.publicKey,
        'EcdsaSecp256k1VerificationKey2019'
      );
      expect(isConsistent).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      // Create an invalid private key (wrong length)
      const invalidPrivateKey = new Uint8Array(10);

      const isConsistent = await CryptoUtils.validateKeyPairConsistency(
        invalidPrivateKey,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isConsistent).toBe(false);
    });
  });

  describe('derivePublicKey', () => {
    it('should derive Ed25519 public key from private key', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const derivedPublicKey = await CryptoUtils.derivePublicKey(
        keyPair.privateKey,
        KeyType.ED25519
      );

      expect(derivedPublicKey).toEqual(keyPair.publicKey);
      expect(derivedPublicKey.length).toBe(32); // Ed25519 raw format
    });

    it('should derive Secp256k1 public key from private key', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const derivedPublicKey = await CryptoUtils.derivePublicKey(
        keyPair.privateKey,
        KeyType.SECP256K1
      );

      expect(derivedPublicKey).toEqual(keyPair.publicKey);
      expect(derivedPublicKey.length).toBe(33); // Secp256k1 compressed format
    });

    it('should derive EcdsaR1 public key from private key', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const derivedPublicKey = await CryptoUtils.derivePublicKey(
        keyPair.privateKey,
        KeyType.ECDSAR1
      );

      expect(derivedPublicKey).toEqual(keyPair.publicKey);
      expect(derivedPublicKey.length).toBe(33); // EcdsaR1 compressed format
    });

    it('should handle invalid private key for Ed25519', async () => {
      const invalidPrivateKey = new Uint8Array(10); // Wrong length

      await expect(
        CryptoUtils.derivePublicKey(invalidPrivateKey, KeyType.ED25519)
      ).rejects.toThrow();
    });

    it('should handle invalid private key for Secp256k1', async () => {
      const invalidPrivateKey = new Uint8Array(10); // Wrong length

      await expect(
        CryptoUtils.derivePublicKey(invalidPrivateKey, KeyType.SECP256K1)
      ).rejects.toThrow();
    });

    it('should handle invalid private key for EcdsaR1', async () => {
      const invalidPrivateKey = new Uint8Array(10); // Wrong length

      await expect(
        CryptoUtils.derivePublicKey(invalidPrivateKey, KeyType.ECDSAR1)
      ).rejects.toThrow();
    });
  });

  describe('provider exception handling', () => {
    it('should reject CryptoKey for Secp256k1 signing', async () => {
      const data = new TextEncoder().encode('test message');
      // Create a proper CryptoKey instance
      const crypto = globalThis.crypto || require('crypto').webcrypto;
      const { privateKey } = await crypto.subtle.generateKey(
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519',
        },
        true,
        ['sign']
      );

      await expect(CryptoUtils.sign(data, privateKey, KeyType.SECP256K1)).rejects.toThrow(
        'CryptoKey is not supported for Secp256k1 signing'
      );
    });

    it('should reject JsonWebKey for Secp256k1 verification', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const data = new TextEncoder().encode('test message');
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.SECP256K1);

      const mockJsonWebKey: JsonWebKey = {
        kty: 'EC',
        crv: 'secp256k1',
        x: 'example',
        y: 'example',
      };

      await expect(
        CryptoUtils.verify(data, signature, mockJsonWebKey, KeyType.SECP256K1)
      ).rejects.toThrow('JsonWebKey is not supported for Secp256k1 verification');
    });
  });

  describe('WebAuthn algorithm mapping', () => {
    it('should map WebAuthn algorithms to KeyType correctly', () => {
      const {
        algorithmToKeyType,
        keyTypeToAlgorithm,
        getSupportedAlgorithms,
      } = require('../../src/types/crypto');

      // Test algorithmToKeyType
      expect(algorithmToKeyType(-8)).toBe(KeyType.ED25519);
      expect(algorithmToKeyType(-7)).toBe(KeyType.ECDSAR1);
      expect(algorithmToKeyType(-999)).toBeUndefined();

      // Test keyTypeToAlgorithm
      expect(keyTypeToAlgorithm(KeyType.ED25519)).toBe(-8);
      expect(keyTypeToAlgorithm(KeyType.ECDSAR1)).toBe(-7);
      expect(keyTypeToAlgorithm(KeyType.SECP256K1)).toBeUndefined();

      // Test getSupportedAlgorithms
      const supportedAlgorithms = getSupportedAlgorithms();
      expect(supportedAlgorithms).toEqual(expect.arrayContaining([-8, -7]));
      expect(supportedAlgorithms).toHaveLength(2);
    });
  });

  describe('Ed25519 JsonWebKey verification', () => {
    it('should verify signatures with JsonWebKey format', async () => {
      // Generate a key pair using Web Crypto API directly to get JsonWebKey
      const crypto = globalThis.crypto || require('crypto').webcrypto;
      const { publicKey, privateKey } = await crypto.subtle.generateKey(
        {
          name: 'Ed25519',
          namedCurve: 'Ed25519',
        },
        true,
        ['sign', 'verify']
      );

      const data = new TextEncoder().encode('test message');

      // Sign with the crypto key
      const signature = await CryptoUtils.sign(data, privateKey, KeyType.ED25519);

      // Export public key as JsonWebKey
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey);

      // Verify with JsonWebKey
      const isValid = await CryptoUtils.verify(data, signature, publicKeyJwk, KeyType.ED25519);
      expect(isValid).toBe(true);
    });
  });

  describe('EcdsaR1 JsonWebKey verification', () => {
    it('should verify signatures with JsonWebKey format', async () => {
      // Generate a key pair using Web Crypto API directly to get JsonWebKey
      const crypto = globalThis.crypto || require('crypto').webcrypto;
      const { publicKey, privateKey } = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify']
      );

      const data = new TextEncoder().encode('test message');

      // Sign with the crypto key
      const signature = await CryptoUtils.sign(data, privateKey, KeyType.ECDSAR1);

      // Export public key as JsonWebKey
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey);

      // Verify with JsonWebKey
      const isValid = await CryptoUtils.verify(data, signature, publicKeyJwk, KeyType.ECDSAR1);
      expect(isValid).toBe(true);
    });
  });

  describe('crypto provider factory', () => {
    it('should throw error for unsupported key type', async () => {
      await expect(CryptoUtils.generateKeyPair('UnsupportedKeyType2024' as any)).rejects.toThrow(
        'Invalid key type'
      );
    });

    it('should support all defined key types', () => {
      const { defaultCryptoProviderFactory } = require('../../src/crypto/factory');

      expect(defaultCryptoProviderFactory.supports(KeyType.ED25519)).toBe(true);
      expect(defaultCryptoProviderFactory.supports(KeyType.SECP256K1)).toBe(true);
      expect(defaultCryptoProviderFactory.supports(KeyType.ECDSAR1)).toBe(true);
    });

    it('should create providers for all supported key types', () => {
      const { defaultCryptoProviderFactory } = require('../../src/crypto/factory');

      const ed25519Provider = defaultCryptoProviderFactory.createProvider(KeyType.ED25519);
      expect(ed25519Provider.getKeyType()).toBe(KeyType.ED25519);

      const secp256k1Provider = defaultCryptoProviderFactory.createProvider(KeyType.SECP256K1);
      expect(secp256k1Provider.getKeyType()).toBe(KeyType.SECP256K1);

      const ecdsaR1Provider = defaultCryptoProviderFactory.createProvider(KeyType.ECDSAR1);
      expect(ecdsaR1Provider.getKeyType()).toBe(KeyType.ECDSAR1);
    });

    it('should throw error for unsupported provider creation', () => {
      const { defaultCryptoProviderFactory } = require('../../src/crypto/factory');

      expect(() => defaultCryptoProviderFactory.createProvider('UnsupportedType' as any)).toThrow(
        'No provider available for key type'
      );
    });
  });

  describe('signature format handling', () => {
    it('should handle EcdsaR1 signature format', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const data = new TextEncoder().encode('test message');

      // Generate signature using our provider
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ECDSAR1);

      // Verify the signature
      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KeyType.ECDSAR1);
      expect(isValid).toBe(true);

      // Web Crypto API returns raw signatures (r+s concatenated)
      expect(signature.length).toBe(64); // 32 bytes r + 32 bytes s
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty data signing and verification', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const emptyData = new Uint8Array(0);

      const signature = await CryptoUtils.sign(emptyData, keyPair.privateKey, KeyType.ED25519);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(
        emptyData,
        signature,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isValid).toBe(true);
    });

    it('should handle corrupted signature gracefully', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const data = new TextEncoder().encode('test message');

      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ED25519);

      // Corrupt the signature
      const corruptedSignature = new Uint8Array(signature);
      corruptedSignature[0] ^= 0xff; // Flip all bits in first byte

      const isValid = await CryptoUtils.verify(
        data,
        corruptedSignature,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isValid).toBe(false);
    }, 10000); // 10 second timeout

    it('should handle invalid public key length for EcdsaR1', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const data = new TextEncoder().encode('test message');
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KeyType.ECDSAR1);

      const invalidPublicKey = new Uint8Array(32); // Wrong length for compressed key

      await expect(
        CryptoUtils.verify(data, signature, invalidPublicKey, KeyType.ECDSAR1)
      ).rejects.toThrow();
    });
  });

  describe('Rooch signature scheme conversion', () => {
    it('should convert KeyType to Rooch signature scheme correctly', () => {
      const { keyTypeToRoochSignatureScheme } = require('../../src/types/crypto');

      expect(keyTypeToRoochSignatureScheme(KeyType.ED25519)).toBe('ED25519');
      expect(keyTypeToRoochSignatureScheme(KeyType.SECP256K1)).toBe('Secp256k1');
      expect(keyTypeToRoochSignatureScheme(KeyType.ECDSAR1)).toBe('EcdsaR1');
    });

    it('should convert Rooch signature scheme to KeyType correctly', () => {
      const { roochSignatureSchemeToKeyType } = require('../../src/types/crypto');

      expect(roochSignatureSchemeToKeyType('ED25519')).toBe(KeyType.ED25519);
      expect(roochSignatureSchemeToKeyType('Secp256k1')).toBe(KeyType.SECP256K1);
      expect(roochSignatureSchemeToKeyType('EcdsaR1')).toBe(KeyType.ECDSAR1);
    });

    it('should throw error for unsupported KeyType to Rooch conversion', () => {
      const { keyTypeToRoochSignatureScheme } = require('../../src/types/crypto');

      expect(() => keyTypeToRoochSignatureScheme('UnsupportedType' as any)).toThrow(
        'Unsupported key type'
      );
    });

    it('should throw error for unsupported Rooch scheme conversion', () => {
      const { roochSignatureSchemeToKeyType } = require('../../src/types/crypto');

      expect(() => roochSignatureSchemeToKeyType('UnsupportedScheme' as any)).toThrow(
        'Unsupported Rooch signature scheme'
      );
    });
  });

  describe('Key type validation', () => {
    it('should validate key types correctly', () => {
      const { isKeyType, toKeyType } = require('../../src/types/crypto');

      expect(isKeyType(KeyType.ED25519)).toBe(true);
      expect(isKeyType(KeyType.SECP256K1)).toBe(true);
      expect(isKeyType(KeyType.ECDSAR1)).toBe(true);
      expect(isKeyType('InvalidType')).toBe(false);

      expect(toKeyType(KeyType.ED25519)).toBe(KeyType.ED25519);
      expect(() => toKeyType('InvalidType')).toThrow('Invalid key type');
    });
  });

  describe('Additional edge cases', () => {
    it('should handle very large data for signing', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const largeData = new Uint8Array(1024 * 1024); // 1MB of data
      largeData.fill(42); // Fill with some data

      const signature = await CryptoUtils.sign(largeData, keyPair.privateKey, KeyType.ED25519);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(
        largeData,
        signature,
        keyPair.publicKey,
        KeyType.ED25519
      );
      expect(isValid).toBe(true);
    });

    it('should handle zero-filled data', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const zeroData = new Uint8Array(100); // All zeros

      const signature = await CryptoUtils.sign(zeroData, keyPair.privateKey, KeyType.SECP256K1);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(
        zeroData,
        signature,
        keyPair.publicKey,
        KeyType.SECP256K1
      );
      expect(isValid).toBe(true);
    });

    it('should handle single byte data', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ECDSAR1);
      const singleByte = new Uint8Array([255]);

      const signature = await CryptoUtils.sign(singleByte, keyPair.privateKey, KeyType.ECDSAR1);
      expect(signature).toBeDefined();

      const isValid = await CryptoUtils.verify(
        singleByte,
        signature,
        keyPair.publicKey,
        KeyType.ECDSAR1
      );
      expect(isValid).toBe(true);
    });

    it('should produce different signatures for different data with same key', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const data1 = new TextEncoder().encode('message 1');
      const data2 = new TextEncoder().encode('message 2');

      const signature1 = await CryptoUtils.sign(data1, keyPair.privateKey, KeyType.ED25519);
      const signature2 = await CryptoUtils.sign(data2, keyPair.privateKey, KeyType.ED25519);

      expect(signature1).not.toEqual(signature2);

      // Both should verify with their respective data
      expect(await CryptoUtils.verify(data1, signature1, keyPair.publicKey, KeyType.ED25519)).toBe(
        true
      );
      expect(await CryptoUtils.verify(data2, signature2, keyPair.publicKey, KeyType.ED25519)).toBe(
        true
      );

      // Cross-verification should fail
      expect(await CryptoUtils.verify(data1, signature2, keyPair.publicKey, KeyType.ED25519)).toBe(
        false
      );
      expect(await CryptoUtils.verify(data2, signature1, keyPair.publicKey, KeyType.ED25519)).toBe(
        false
      );
    });
  });
});
