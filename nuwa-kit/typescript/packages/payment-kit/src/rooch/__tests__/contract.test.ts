/**
 * Tests for RoochPaymentChannelContract
 */

import { describe, test, expect } from '@jest/globals';
import { CloseProofSchema, CloseProofsSchema } from '../RoochPaymentChannelContract';

describe('RoochPaymentChannelContract BCS Serialization', () => {
  describe('CloseProofs serialization', () => {
    test('should serialize and deserialize CloseProof correctly', () => {
      const sampleCloseProof = {
        vm_id_fragment: 'test-key',
        accumulated_amount: '10000',
        nonce: '1',
        sender_signature: [1, 2, 3, 4, 5], // Sample signature bytes
      };

      // Encode CloseProof to bytes
      const encoded = CloseProofSchema.serialize(sampleCloseProof).toBytes();
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);

      // Decode back to CloseProof
      const decoded = CloseProofSchema.parse(encoded);
      
      // Verify all fields match
      expect(decoded.vm_id_fragment).toBe(sampleCloseProof.vm_id_fragment);
      expect(decoded.accumulated_amount).toBe(sampleCloseProof.accumulated_amount);
      expect(decoded.nonce).toBe(sampleCloseProof.nonce);
      expect(decoded.sender_signature).toEqual(sampleCloseProof.sender_signature);
    });

    test('should serialize and deserialize CloseProofs container correctly', () => {
      const sampleCloseProofs = {
        proofs: [
          {
            vm_id_fragment: 'test-key-1',
            accumulated_amount: '10000',
            nonce: '1',
            sender_signature: [1, 2, 3, 4, 5],
          },
          {
            vm_id_fragment: 'test-key-2',
            accumulated_amount: '20000',
            nonce: '2',
            sender_signature: [6, 7, 8, 9, 10],
          },
        ],
      };

      // Encode CloseProofs to bytes
      const encoded = CloseProofsSchema.serialize(sampleCloseProofs).toBytes();
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);

      // Decode back to CloseProofs
      const decoded = CloseProofsSchema.parse(encoded);
      
      // Verify structure
      expect(decoded.proofs).toHaveLength(2);
      expect(decoded.proofs[0].vm_id_fragment).toBe('test-key-1');
      expect(decoded.proofs[0].accumulated_amount).toBe('10000');
      expect(decoded.proofs[1].vm_id_fragment).toBe('test-key-2');
      expect(decoded.proofs[1].accumulated_amount).toBe('20000');
    });

    test('should handle empty proofs array', () => {
      const emptyCloseProofs = {
        proofs: [],
      };

      // Encode empty CloseProofs
      const encoded = CloseProofsSchema.serialize(emptyCloseProofs).toBytes();
      expect(encoded).toBeInstanceOf(Uint8Array);

      // Decode back
      const decoded = CloseProofsSchema.parse(encoded);
      expect(decoded.proofs).toHaveLength(0);
    });

    test('should handle large accumulated amounts and nonces', () => {
      const largeValueProof = {
        vm_id_fragment: 'large-test',
        accumulated_amount: '18446744073709551615', // Near max u64
        nonce: '999999999999999999',
        sender_signature: new Array(65).fill(0).map((_, i) => i % 256), // 65-byte signature
      };

      const closeProofs = {
        proofs: [largeValueProof],
      };

      // Should not throw on large values
      const encoded = CloseProofsSchema.serialize(closeProofs).toBytes();
      const decoded = CloseProofsSchema.parse(encoded);
      
      expect(decoded.proofs[0].accumulated_amount).toBe(largeValueProof.accumulated_amount);
      expect(decoded.proofs[0].nonce).toBe(largeValueProof.nonce);
      expect(decoded.proofs[0].sender_signature).toEqual(largeValueProof.sender_signature);
    });
  });
}); 