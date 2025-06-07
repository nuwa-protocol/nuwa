import { LocalSigner } from '../src/signers/LocalSigner';
import { CryptoUtils } from '../src/cryptoUtils';
import { KEY_TYPE } from '../src/types';
import { describe, it, expect } from '@jest/globals';

describe('LocalSigner', () => {
  const testDid = 'did:example:123';

  describe('Basic Operations', () => {
    it('should create a signer with a new key', async () => {
      const { signer, keyId } = await LocalSigner.createWithNewKey(testDid, 'key-1');
      
      // Check if key is available
      const keyIds = await signer.listKeyIds();
      expect(keyIds).toContain(keyId);
      expect(keyId).toBe(`${testDid}#key-1`);
      
      // Check if can sign with key
      expect(await signer.canSignWithKeyId(keyId)).toBe(true);
    });

    it('should create a signer with multiple keys', async () => {
      const keyConfigs = [
        { type: KEY_TYPE.ED25519, fragment: 'auth-key' },
        { type: KEY_TYPE.SECP256K1, fragment: 'delegation-key' }
      ];

      const { signer, keyIds } = await LocalSigner.createWithMultipleKeys(testDid, keyConfigs);
      
      // Check if all keys are available
      const availableKeys = await signer.listKeyIds();
      expect(availableKeys).toHaveLength(2);
      expect(keyIds).toContain(`${testDid}#auth-key`);
      expect(keyIds).toContain(`${testDid}#delegation-key`);
    });
  });

  describe('Signing Operations', () => {
    it('should sign data with specified key', async () => {
      const { signer, keyId } = await LocalSigner.createWithNewKey(testDid);
      
      const data = new TextEncoder().encode('test data');
      const signature = await signer.signWithKeyId(data, keyId);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should throw error when signing with non-existent key', async () => {
      const { signer } = await LocalSigner.createWithNewKey(testDid);
      const data = new TextEncoder().encode('test data');
      
      await expect(
        signer.signWithKeyId(data, `${testDid}#non-existent`)
      ).rejects.toThrow('Key');
    });
  });

  describe('Key Information', () => {
    it('should return key information', async () => {
      const { signer, keyId } = await LocalSigner.createWithNewKey(testDid);
      
      const keyInfo = await signer.getKeyInfo(keyId);
      expect(keyInfo).toBeDefined();
      expect(keyInfo?.type).toBe(KEY_TYPE.ED25519);
      expect(keyInfo?.publicKey).toBeInstanceOf(Uint8Array);
    });

    it('should return undefined for non-existent key', async () => {
      const { signer } = await LocalSigner.createWithNewKey(testDid);
      
      const keyInfo = await signer.getKeyInfo(`${testDid}#non-existent`);
      expect(keyInfo).toBeUndefined();
    });
  });

  describe('End-to-End Signing and Verification', () => {
    it('should generate valid signatures that can be verified', async () => {
      // Create signer with a new key
      const { signer, keyId } = await LocalSigner.createWithNewKey(testDid);
      
      // Get key info to know the key type
      const keyInfo = await signer.getKeyInfo(keyId);
      expect(keyInfo).toBeDefined();
      
      // Sign some test data
      const data = new TextEncoder().encode('test data');
      const signature = await signer.signWithKeyId(data, keyId);
      
      // Verify the signature using CryptoUtils
      const isValid = await CryptoUtils.verify(
        data,
        signature,
        keyInfo!.publicKey,
        keyInfo!.type
      );
      
      expect(isValid).toBe(true);
    });
  });
}); 