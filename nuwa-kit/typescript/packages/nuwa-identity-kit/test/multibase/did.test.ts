import { describe, it, expect } from '@jest/globals';
import { DidKeyCodec } from '../../src/multibase';
import { KEY_TYPE } from '../../src/types';

describe('DidKeyCodec', () => {
  describe('generateDidKey', () => {
    it('should generate valid did:key for Ed25519', () => {
      const testKey = new Uint8Array(32).fill(1);
      const didKey = DidKeyCodec.generateDidKey(testKey, KEY_TYPE.ED25519);
      
      // Should be properly formatted did:key
      expect(didKey).toMatch(/^did:key:z/);
      
      // Should be parseable
      const parsed = DidKeyCodec.parseDidKey(didKey);
      expect(parsed.keyType).toBe(KEY_TYPE.ED25519);
      expect(parsed.publicKey).toEqual(testKey);
    });

    it('should generate valid did:key for Secp256k1', () => {
      const testKey = new Uint8Array(33).fill(2);
      const didKey = DidKeyCodec.generateDidKey(testKey, KEY_TYPE.SECP256K1);
      
      // Should be properly formatted did:key
      expect(didKey).toMatch(/^did:key:z/);
      
      // Should be parseable
      const parsed = DidKeyCodec.parseDidKey(didKey);
      expect(parsed.keyType).toBe(KEY_TYPE.SECP256K1);
      expect(parsed.publicKey).toEqual(testKey);
    });
  });

  describe('parseDidKey', () => {
    it('should parse valid Ed25519 did:key', () => {
      const testKey = new Uint8Array(32).fill(1);
      const didKey = DidKeyCodec.generateDidKey(testKey, KEY_TYPE.ED25519);
      const parsed = DidKeyCodec.parseDidKey(didKey);
      
      expect(parsed.keyType).toBe(KEY_TYPE.ED25519);
      expect(parsed.publicKey).toEqual(testKey);
    });

    it('should parse valid Secp256k1 did:key', () => {
      const testKey = new Uint8Array(33).fill(2);
      const didKey = DidKeyCodec.generateDidKey(testKey, KEY_TYPE.SECP256K1);
      const parsed = DidKeyCodec.parseDidKey(didKey);
      
      expect(parsed.keyType).toBe(KEY_TYPE.SECP256K1);
      expect(parsed.publicKey).toEqual(testKey);
    });

    it('should throw error for invalid did:key format', () => {
      expect(() => {
        DidKeyCodec.parseDidKey('invalid:format');
      }).toThrow('Invalid did:key format');

      expect(() => {
        DidKeyCodec.parseDidKey('did:notkey:z123');
      }).toThrow('Invalid did:key format');
    });
  });

  describe('Round trip', () => {
    it('should maintain key integrity through generate-parse cycle for Ed25519', () => {
      const originalKey = new Uint8Array(32).fill(3);
      const didKey = DidKeyCodec.generateDidKey(originalKey, KEY_TYPE.ED25519);
      const { keyType, publicKey } = DidKeyCodec.parseDidKey(didKey);
      
      expect(keyType).toBe(KEY_TYPE.ED25519);
      expect(publicKey).toEqual(originalKey);
    });

    it('should maintain key integrity through generate-parse cycle for Secp256k1', () => {
      const originalKey = new Uint8Array(33).fill(4);
      const didKey = DidKeyCodec.generateDidKey(originalKey, KEY_TYPE.SECP256K1);
      const { keyType, publicKey } = DidKeyCodec.parseDidKey(didKey);
      
      expect(keyType).toBe(KEY_TYPE.SECP256K1);
      expect(publicKey).toEqual(originalKey);
    });
  });

  describe('Error handling', () => {
    it('should handle empty key gracefully', () => {
      const emptyEd25519Key = new Uint8Array(32);
      const emptySecp256k1Key = new Uint8Array(33);
      
      // Should not throw for empty keys of correct length
      expect(() => {
        DidKeyCodec.generateDidKey(emptyEd25519Key, KEY_TYPE.ED25519);
      }).not.toThrow();
      
      expect(() => {
        DidKeyCodec.generateDidKey(emptySecp256k1Key, KEY_TYPE.SECP256K1);
      }).not.toThrow();
    });

    it('should throw error for invalid key length', () => {
      const invalidLengthKey = new Uint8Array(16); // Too short for both types
      
      expect(() => {
        DidKeyCodec.generateDidKey(invalidLengthKey, KEY_TYPE.ED25519);
      }).toThrow();
      
      expect(() => {
        DidKeyCodec.generateDidKey(invalidLengthKey, KEY_TYPE.SECP256K1);
      }).toThrow();
    });
  });
}); 