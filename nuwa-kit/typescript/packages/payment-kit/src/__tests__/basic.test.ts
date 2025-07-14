/**
 * Basic tests for payment-kit core functionality
 */

import { describe, it, expect } from '@jest/globals';
import { 
  SubRAVCodec, 
  SubRAVValidator,
  HttpHeaderCodec,
  generateNonce,
  extractFragment,
  isValidHex,
  formatAmount,
  SUBRAV_VERSION_1
} from '../index';
import type { SubRAV, SignedSubRAV } from '../core/types';

describe('Payment Kit Basic Tests', () => {
  describe('SubRAV Types and Validation', () => {
    it('should validate valid SubRAV', () => {
      const subRav: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: BigInt(4),
        channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        channelEpoch: BigInt(0),
        vmIdFragment: 'test-key',
        accumulatedAmount: BigInt(1000),
        nonce: BigInt(1),
      };

      const result = SubRAVValidator.validate(subRav);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid SubRAV', () => {
      const subRav: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: BigInt(-1), // Invalid negative chain ID
        channelId: 'invalid', // Invalid channel ID format
        channelEpoch: BigInt(0),
        vmIdFragment: '', // Empty fragment
        accumulatedAmount: BigInt(-100), // Invalid negative amount
        nonce: BigInt(-1), // Invalid negative nonce
      };

      const result = SubRAVValidator.validate(subRav);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('SubRAV Codec', () => {
    it('should encode and decode SubRAV correctly', () => {
      const original: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: BigInt(4),
        channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        channelEpoch: BigInt(0),
        vmIdFragment: 'test-key',
        accumulatedAmount: BigInt(1000),
        nonce: BigInt(1),
      };

      const encoded = SubRAVCodec.encode(original);
      expect(encoded).toBeInstanceOf(Uint8Array);

      const decoded = SubRAVCodec.decode(encoded);
      expect(decoded).toEqual(original);
    });
  });

  describe('Utility Functions', () => {
    it('should generate valid nonce', () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe('bigint');
      expect(nonce).toBeGreaterThan(BigInt(0));
    });

    it('should extract fragment from keyId', () => {
      const keyId = 'did:rooch:0x123#test-key';
      const fragment = extractFragment(keyId);
      expect(fragment).toBe('test-key');
    });

    it('should validate hex strings', () => {
      expect(isValidHex('0x123abc', 6)).toBe(true);
      expect(isValidHex('0x123ABC', 6)).toBe(true);
      expect(isValidHex('0x123', 6)).toBe(false); // Wrong length
      expect(isValidHex('123abc')).toBe(false); // Missing 0x prefix
      expect(isValidHex('0xGGG')).toBe(false); // Invalid hex
    });

    it('should format amounts correctly', () => {
      expect(formatAmount(BigInt('1000000000000000000'), 18)).toBe('1');
      expect(formatAmount(BigInt('1500000000000000000'), 18)).toBe('1.5');
      expect(formatAmount(BigInt('1000000000000000'), 18)).toBe('0.001');
    });
  });

  describe('HTTP Header Codec', () => {
    it('should get header name', () => {
      const headerName = HttpHeaderCodec.getHeaderName();
      expect(headerName).toBe('X-Payment-Channel-Data');
    });

    // Note: Full HTTP codec tests would require mock SignedSubRAV which needs
    // signing functionality, so we'll keep these basic for now
  });

  describe('SubRAV Sequence Validation', () => {
    it('should validate correct sequence', () => {
      const prev: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: BigInt(4),
        channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        channelEpoch: BigInt(0),
        vmIdFragment: 'test-key',
        accumulatedAmount: BigInt(1000),
        nonce: BigInt(1),
      };

      const current: SubRAV = {
        ...prev,
        accumulatedAmount: BigInt(1500),
        nonce: BigInt(2),
      };

      const result = SubRAVValidator.validateSequence(prev, current);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid sequence', () => {
      const prev: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: BigInt(4),
        channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        channelEpoch: BigInt(0),
        vmIdFragment: 'test-key',
        accumulatedAmount: BigInt(1000),
        nonce: BigInt(2),
      };

      const current: SubRAV = {
        ...prev,
        accumulatedAmount: BigInt(500), // Amount decreased
        nonce: BigInt(1), // Nonce decreased
      };

      const result = SubRAVValidator.validateSequence(prev, current);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
}); 