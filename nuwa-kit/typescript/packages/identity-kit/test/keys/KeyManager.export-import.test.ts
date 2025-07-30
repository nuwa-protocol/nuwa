import { describe, it, expect, beforeEach } from '@jest/globals';
import { KeyManager } from '../../src/keys/KeyManager';
import { MemoryKeyStore } from '../../src/keys/KeyStore';
import { KeyType } from '../../src/types/crypto';
import { CryptoUtils } from '../../src/crypto/utils';
import { KeyMultibaseCodec } from '../../src/multibase';

describe('KeyManager Export/Import', () => {
  let keyManager: KeyManager;
  let testKeyId: string;

  beforeEach(async () => {
    // Create a KeyManager with a test key
    const result = await KeyManager.createWithDidKey();
    keyManager = result.keyManager;
    testKeyId = result.keyId;
  });

  describe('exportKeyToString', () => {
    it('should export a key to a base58btc encoded string', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      
      // Should start with 'z' (base58btc prefix)
      expect(exportedString).toMatch(/^z/);
      
      // Should be a non-empty string
      expect(exportedString.length).toBeGreaterThan(1);
    });

    it('should throw error for non-existent key', async () => {
      await expect(keyManager.exportKeyToString('non-existent-key'))
        .rejects.toThrow('Key non-existent-key not found');
    });

    it('should export keys with different types consistently', async () => {
      // Generate a SECP256K1 key
      const secp256k1Key = await keyManager.generateKey('secp256k1-test', KeyType.SECP256K1);
      const exportedSecp256k1 = await keyManager.exportKeyToString(secp256k1Key.keyId);
      
      expect(exportedSecp256k1).toMatch(/^z/);
      expect(exportedSecp256k1).not.toBe(await keyManager.exportKeyToString(testKeyId));
    });
  });

  describe('importKeyFromString', () => {
    it('should import a key from exported string', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      
      // Create a new KeyManager and import the key
      const newKeyManager = new KeyManager({ store: new MemoryKeyStore() });
      const importedKey = await newKeyManager.importKeyFromString(exportedString);
      
      // Verify the imported key
      expect(importedKey.keyId).toBe(testKeyId);
      expect(importedKey.keyType).toBe(KeyType.ED25519);
      expect(importedKey.publicKeyMultibase).toBeDefined();
      expect(importedKey.privateKeyMultibase).toBeDefined();
    });

    it('should allow signing with imported key', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      
      // Create a new KeyManager and import the key
      const newKeyManager = new KeyManager({ store: new MemoryKeyStore() });
      await newKeyManager.importKeyFromString(exportedString);
      
      // Test that we can sign with the imported key
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = await newKeyManager.signWithKeyId(testData, testKeyId);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should handle keys without private key', async () => {
      // Create a public-key-only StoredKey
      const originalKey = await keyManager.getStoredKey(testKeyId);
      if (!originalKey) throw new Error('Test key not found');
      
      const publicKeyOnly = {
        ...originalKey,
        privateKeyMultibase: undefined
      };
      
      // Export and import the public-key-only version
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      const newKeyManager = new KeyManager({ store: new MemoryKeyStore() });
      const importedKey = await newKeyManager.importKeyFromString(exportedString);
      
      expect(importedKey.privateKeyMultibase).toBeDefined(); // Should still have private key from original
    });

    it('should throw error for invalid serialized string', async () => {
      const newKeyManager = new KeyManager({ store: new MemoryKeyStore() });
      
      await expect(newKeyManager.importKeyFromString('invalid-string'))
        .rejects.toThrow();
    });
  });

  describe('fromSerializedKey', () => {
    it('should create a new KeyManager from serialized key', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      
      // Verify the new KeyManager has the key
      const importedKey = await newKeyManager.getStoredKey(testKeyId);
      expect(importedKey).toBeDefined();
      expect(importedKey!.keyId).toBe(testKeyId);
    });

    it('should create KeyManager with correct DID', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      const did = await newKeyManager.getDid();
      
      expect(did).toBe(await keyManager.getDid());
    });

    it('should use custom KeyStore when provided', async () => {
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      const customStore = new MemoryKeyStore();
      
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString, customStore);
      
      // Verify the key is stored in the custom store
      const keyFromStore = await customStore.load(testKeyId);
      expect(keyFromStore).toBeDefined();
      expect(keyFromStore!.keyId).toBe(testKeyId);
    });

    it('should handle multiple keys scenario', async () => {
      // Add another key to the original KeyManager
      const secondKey = await keyManager.generateKey('second-key', KeyType.SECP256K1);
      
      // Export and create new KeyManager for each key
      const firstExported = await keyManager.exportKeyToString(testKeyId);
      const secondExported = await keyManager.exportKeyToString(secondKey.keyId);
      
      const km1 = await KeyManager.fromSerializedKey(firstExported);
      const km2 = await KeyManager.fromSerializedKey(secondExported);
      
      // Each should have only their respective key
      expect(await km1.getStoredKey(testKeyId)).toBeDefined();
      expect(await km1.getStoredKey(secondKey.keyId)).toBeNull();
      
      expect(await km2.getStoredKey(secondKey.keyId)).toBeDefined();
      expect(await km2.getStoredKey(testKeyId)).toBeNull();
    });
  });

  describe('round-trip export/import', () => {
    it('should maintain key functionality through export/import cycle', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Sign with original key
      const originalSignature = await keyManager.signWithKeyId(testData, testKeyId);
      
      // Export and import
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      
      // Sign with imported key
      const importedSignature = await newKeyManager.signWithKeyId(testData, testKeyId);
      
      // Signatures should be identical (same key, same data)
      expect(importedSignature).toEqual(originalSignature);
    });

    it('should preserve all key metadata', async () => {
      // Add metadata to the key
      const originalKey = await keyManager.getStoredKey(testKeyId);
      if (!originalKey) throw new Error('Test key not found');
      
      originalKey.meta = {
        created: new Date().toISOString(),
        purpose: 'testing',
        tags: ['test', 'export-import']
      };
      
      await keyManager.importKey(originalKey); // Update with metadata
      
      // Export and import
      const exportedString = await keyManager.exportKeyToString(testKeyId);
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      
      const importedKey = await newKeyManager.getStoredKey(testKeyId);
      expect(importedKey?.meta).toEqual(originalKey.meta);
    });
  });

  describe('import with automatic validation', () => {
    it('should successfully import consistent keys', async () => {
      const { keyManager, keyId } = await KeyManager.createWithDidKey();
      
      // Export the key
      const exportedString = await keyManager.exportKeyToString(keyId);
      
      // Import - should succeed with automatic validation
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      const importedKey = await newKeyManager.getStoredKey(keyId);
      
      expect(importedKey).toBeDefined();
      expect(importedKey?.keyId).toBe(keyId);
    });

    it('should import consistent keys to existing KeyManager', async () => {
      // Create KeyManager with Secp256k1 key manually
      const keyPair = await CryptoUtils.generateKeyPair(KeyType.SECP256K1);
      const publicKeyMultibase = KeyMultibaseCodec.encodeWithType(keyPair.publicKey, KeyType.SECP256K1);
      const didKey = `did:key:${publicKeyMultibase}`;
      const keyManager = KeyManager.createEmpty(didKey);
      const keyId = await keyManager.importKeyPair('test-key', keyPair, KeyType.SECP256K1);
      
      // Export the key
      const exportedString = await keyManager.exportKeyToString(keyId);
      
      // Create a new KeyManager with automatic validation
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      
      // Verify it's correctly imported
      const retrievedKey = await newKeyManager.getStoredKey(keyId);
      expect(retrievedKey).toBeDefined();
      expect(retrievedKey?.keyId).toBe(keyId);
      expect(retrievedKey?.keyType).toBe(KeyType.SECP256K1);
    });

    it('should test automatic validation with different key types', async () => {
      const keyTypes = [KeyType.ED25519, KeyType.SECP256K1, KeyType.ECDSAR1];
      
      for (const keyType of keyTypes) {
        // Create KeyManager with specific key type manually
        const keyPair = await CryptoUtils.generateKeyPair(keyType);
        const publicKeyMultibase = KeyMultibaseCodec.encodeWithType(keyPair.publicKey, keyType);
        const didKey = `did:key:${publicKeyMultibase}`;
        const keyManager = KeyManager.createEmpty(didKey);
        const keyId = await keyManager.importKeyPair('test-key', keyPair, keyType);
        
        const exportedString = await keyManager.exportKeyToString(keyId);
        
        // Should succeed validation for all key types
        const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
        const importedKey = await newKeyManager.getStoredKey(keyId);
        
        expect(importedKey?.keyType).toBe(keyType);
      }
    });

    it('should handle keys without private key during validation', async () => {
      const { keyManager, keyId } = await KeyManager.createWithDidKey();
      const storedKey = await keyManager.getStoredKey(keyId);
      
      // Create a copy without private key
      const publicKeyOnly = {
        ...storedKey!,
        privateKeyMultibase: undefined
      };
      
      // Update the key in store
      await keyManager.importKey(publicKeyOnly);
      
      // Export and validate - should skip validation and succeed
      const exportedString = await keyManager.exportKeyToString(keyId);
      const newKeyManager = await KeyManager.fromSerializedKey(exportedString);
      const importedKey = await newKeyManager.getStoredKey(keyId);
      
      expect(importedKey?.privateKeyMultibase).toBeUndefined();
    });
  });
}); 