import { describe, it, expect } from '@jest/globals';
import { CryptoUtils } from '../../src/cryptoUtils';
import { KEY_TYPE } from '../../src/types';
import { base64url } from 'multiformats/bases/base64';


describe('CryptoUtils', () => {
  describe('generateKeyPair', () => {
    it('should generate Ed25519 key pair by default', async () => {
      const keyPair = await CryptoUtils.generateKeyPair();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate Ed25519 key pair explicitly', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate Secp256k1 key pair', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.SECP256K1);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should generate ECDSAR1 key pair', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ECDSAR1);
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    it('should throw error for invalid key type', async () => {
      await expect(CryptoUtils.generateKeyPair('invalid-type' as any))
        .rejects
        .toThrow('Invalid key type');
    });
  });

  describe('publicKeyToMultibase', () => {
    it('should convert Ed25519 public key to multibase', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const multibase = await CryptoUtils.publicKeyToMultibase(keyPair.publicKey, KEY_TYPE.ED25519);
      expect(multibase).toMatch(/^z[1-9A-Za-z]+$/); // Base58btc encoded string
    });

    it('should convert Secp256k1 public key to multibase', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.SECP256K1);
      const multibase = await CryptoUtils.publicKeyToMultibase(keyPair.publicKey, KEY_TYPE.SECP256K1);
      expect(multibase).toMatch(/^z[1-9A-Za-z]+$/); // Base58btc encoded string
    });

    it('should convert ECDSAR1 public key to multibase', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ECDSAR1);
      const multibase = await CryptoUtils.publicKeyToMultibase(keyPair.publicKey, KEY_TYPE.ECDSAR1);
      expect(multibase).toMatch(/^z[1-9A-Za-z]+$/); // Base58btc encoded string
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify with Ed25519', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const data = new TextEncoder().encode('test message');
      
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KEY_TYPE.ED25519);
      expect(signature).toBeDefined();
      
      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KEY_TYPE.ED25519);
      expect(isValid).toBe(true);
    });

    it('should sign and verify with Secp256k1', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.SECP256K1);
      const data = new TextEncoder().encode('test message');
      
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KEY_TYPE.SECP256K1);
      expect(signature).toBeDefined();
      
      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KEY_TYPE.SECP256K1);
      expect(isValid).toBe(true);
    });

    it('should sign and verify with ECDSAR1', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ECDSAR1);
      const data = new TextEncoder().encode('test message');
      
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KEY_TYPE.ECDSAR1);
      expect(signature).toBeDefined();
      
      const isValid = await CryptoUtils.verify(data, signature, keyPair.publicKey, KEY_TYPE.ECDSAR1);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', async () => {
      const keyPair1 = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const keyPair2 = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const data = new TextEncoder().encode('test message');
      
      const signature = await CryptoUtils.sign(data, keyPair1.privateKey, KEY_TYPE.ED25519);
      const isValid = await CryptoUtils.verify(data, signature, keyPair2.publicKey, KEY_TYPE.ED25519);
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered data', async () => {
      const keyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const data = new TextEncoder().encode('test message');
      const tamperedData = new TextEncoder().encode('tampered message');
      
      const signature = await CryptoUtils.sign(data, keyPair.privateKey, KEY_TYPE.ED25519);
      const isValid = await CryptoUtils.verify(tamperedData, signature, keyPair.publicKey, KEY_TYPE.ED25519);
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
      const enumKeyPair = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      
      const data = new TextEncoder().encode('test message');
      
      // Cross-verify signatures
      const stringSignature = await CryptoUtils.sign(data, stringKeyPair.privateKey, 'Ed25519VerificationKey2020');
      const enumSignature = await CryptoUtils.sign(data, enumKeyPair.privateKey, KEY_TYPE.ED25519);
      
      const isValidString = await CryptoUtils.verify(data, stringSignature, stringKeyPair.publicKey, KEY_TYPE.ED25519);
      const isValidEnum = await CryptoUtils.verify(data, enumSignature, enumKeyPair.publicKey, 'Ed25519VerificationKey2020');
      
      expect(isValidString).toBe(true);
      expect(isValidEnum).toBe(true);
    });
  });
}); 