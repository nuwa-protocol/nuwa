import { describe, it, expect } from '@jest/globals';
import { BaseMultibaseCodec } from '../../src/multibase';

describe('BaseMultibaseCodec', () => {
  describe('base58btc', () => {
    it('should encode and decode base58btc correctly', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = BaseMultibaseCodec.encodeBase58btc(testData);

      // Should start with 'z' prefix
      expect(encoded).toMatch(/^z/);

      const decoded = BaseMultibaseCodec.decodeBase58btc(encoded);
      expect(decoded).toEqual(testData);
    });

    it('should handle empty input for base58btc', () => {
      const testData = new Uint8Array([]);
      const encoded = BaseMultibaseCodec.encodeBase58btc(testData);
      const decoded = BaseMultibaseCodec.decodeBase58btc(encoded);
      expect(decoded).toEqual(testData);
    });
  });

  describe('base64pad', () => {
    it('should encode and decode base64pad correctly', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = BaseMultibaseCodec.encodeBase64pad(testData);

      // Should start with 'M' prefix
      expect(encoded).toMatch(/^M/);

      // Should have padding when needed
      expect(encoded).toMatch(/=+$/);

      const decoded = BaseMultibaseCodec.decodeBase64pad(encoded);
      expect(decoded).toEqual(testData);
    });

    it('should handle empty input for base64pad', () => {
      const testData = new Uint8Array([]);
      const encoded = BaseMultibaseCodec.encodeBase64pad(testData);
      const decoded = BaseMultibaseCodec.decodeBase64pad(encoded);
      expect(decoded).toEqual(testData);
    });
  });

  describe('base16', () => {
    it('should encode and decode base16 correctly', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = BaseMultibaseCodec.encodeBase16(testData);

      // Should start with 'f' prefix
      expect(encoded).toMatch(/^f/);

      // Should be valid hex
      expect(encoded.slice(1)).toMatch(/^[0-9a-f]+$/);

      const decoded = BaseMultibaseCodec.decodeBase16(encoded);
      expect(decoded).toEqual(testData);
    });

    it('should handle empty input for base16', () => {
      const testData = new Uint8Array([]);
      const encoded = BaseMultibaseCodec.encodeBase16(testData);
      const decoded = BaseMultibaseCodec.decodeBase16(encoded);
      expect(decoded).toEqual(testData);
    });

    it('should decode base16 without prefix', () => {
      const hex = '0102030405';
      const expected = new Uint8Array([1, 2, 3, 4, 5]);
      const decoded = BaseMultibaseCodec.decodeBase16(hex);
      expect(decoded).toEqual(expected);
    });
  });
});
