/**
 * Tests for RoochPaymentChannelContract
 */

import { describe, test, expect } from '@jest/globals';
import {
  CloseProofSchema,
  CloseProofsSchema,
  RoochPaymentChannelContract,
} from '../RoochPaymentChannelContract';

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

    test('should serialize and deserialize CloseProofs correctly', () => {
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

      // Verify all fields match
      expect(decoded.proofs).toHaveLength(2);
      expect(decoded.proofs[0].vm_id_fragment).toBe(sampleCloseProofs.proofs[0].vm_id_fragment);
      expect(decoded.proofs[1].accumulated_amount).toBe(
        sampleCloseProofs.proofs[1].accumulated_amount
      );
    });
  });
});
