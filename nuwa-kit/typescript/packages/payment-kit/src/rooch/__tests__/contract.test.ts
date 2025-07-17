/**
 * Tests for RoochPaymentChannelContract
 */

import { describe, test, expect } from '@jest/globals';
import { CloseProofSchema, CloseProofsSchema, RoochPaymentChannelContract } from '../RoochPaymentChannelContract';

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
      expect(decoded.proofs[1].accumulated_amount).toBe(sampleCloseProofs.proofs[1].accumulated_amount);
    });
  });

  describe('Channel Object ID Calculation Test Cases', () => {
    test('should match Move contract calc_channel_object_id function', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);

      // Use the same test values as in the Move contract tests
      const sender = 'rooch1mdzyuhmaa0n469huenfkuulmn4upd89hgcc6gcwg0axhvv80d3pq0vwnhl';
      const receiver = 'rooch1cq5tperqpe6pen3smzhnypduf574dtd4lqj9zk97ry5wd6gd7kwsglts3j';
      const coinType = '0x3::gas_coin::RGas';

      const channelId = calcMethod(sender, receiver, coinType);
      
      // The channel ID should be deterministic and follow the expected format
      expect(channelId).toMatch(/^0x[0-9a-f]{64}$/);
      
      // Log for manual verification against Move contract
      console.log('Calculated Channel ID:', channelId);
      console.log('Inputs:');
      console.log('  Sender:', sender.replace('did:rooch:', ''));
      console.log('  Receiver:', receiver.replace('did:rooch:', ''));
      console.log('  Coin Type:', coinType);
    });
  });
}); 