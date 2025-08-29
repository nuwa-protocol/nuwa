/**
 * Basic functionality tests for Payment Kit
 *
 * These tests verify core functionality without requiring external dependencies
 * like databases or blockchain connections.
 */

import { describe, it, expect } from '@jest/globals';
import {
  SubRAVCodec,
  HttpPaymentCodec,
  generateNonce,
  extractFragment,
  isValidHex,
  formatAmount,
  SUBRAV_VERSION_1,
  PaymentChannelPayerClient,
  PaymentChannelPayeeClient,
  createStorageRepositories,
} from '../index';
import { createTestEnvironment } from '../test-helpers/mocks';
import type { SubRAV, SignedSubRAV } from '../core/types';

describe('Payment Kit Basic Tests', () => {
  // Removed SubRAVValidator tests; validation is now enforced via RavVerifier utilities

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
      const headerName = HttpPaymentCodec.getHeaderName();
      expect(headerName).toBe('X-Payment-Channel-Data');
    });

    // Note: Full HTTP codec tests would require mock SignedSubRAV which needs
    // signing functionality, so we'll keep these basic for now
  });

  // Removed SubRAV sequence validation tests in favor of RavVerifier assertions
});
