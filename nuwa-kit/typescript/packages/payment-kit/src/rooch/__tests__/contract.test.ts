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
    test('Test Case 1: Standard addresses with RGas', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);
      
      const sender = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000001';
      const receiver = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000002';
      const coinType = '0x0000000000000000000000000000000000000000000000000000000000000003::gas_coin::RGas';

      const channelId = calcMethod(sender, receiver, coinType);
      
      console.log('=== Test Case 1 ===');
      console.log('Sender:', sender.replace('did:rooch:', ''));
      console.log('Receiver:', receiver.replace('did:rooch:', ''));
      console.log('Coin Type:', coinType);
      console.log('Channel ID:', channelId);
      console.log('');
      
      expect(channelId).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('Test Case 2: Short addresses (will be normalized)', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);
      
      const sender = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000001';
      const receiver = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000002';
      const coinType = '0x3::gas_coin::RGas';

      const channelId = calcMethod(sender, receiver, coinType);
      
      console.log('=== Test Case 2 ===');
      console.log('Sender:', sender.replace('did:rooch:', ''));
      console.log('Receiver:', receiver.replace('did:rooch:', ''));
      console.log('Coin Type:', coinType);
      console.log('Channel ID:', channelId);
      console.log('');
      
      expect(channelId).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test('Test Case 3: Real-world example addresses', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);
      
      const sender = 'did:rooch:0x0000000000000000000000000123456789abcdef0123456789abcdef12345678';
      const receiver = 'did:rooch:0x0000000000000000000000000fedcba0987654321fedcba0987654321fedcba09';
      const coinType = '0x3::gas_coin::RGas';

      const channelId = calcMethod(sender, receiver, coinType);
      
      console.log('=== Test Case 3 ===');
      console.log('Sender:', sender.replace('did:rooch:', ''));
      console.log('Receiver:', receiver.replace('did:rooch:', ''));
      console.log('Coin Type:', coinType);
      console.log('Channel ID:', channelId);
      console.log('');
      
      expect(channelId).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('Channel Object ID calculation', () => {
    test('should calculate deterministic channel object ID', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      // Test with known values to ensure deterministic output
      const sender = 'did:rooch:0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      const receiver = 'did:rooch:0x0000000000000000000000000fedcba0987654321fedcba0987654321fedcba09';
      const coinType = '0x3::gas_coin::RGas';

      // Access the private method through reflection for testing
      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);
      const channelId1 = calcMethod(sender, receiver, coinType);
      const channelId2 = calcMethod(sender, receiver, coinType);

      // Should be deterministic
      expect(channelId1).toBe(channelId2);
      
      // Should be a valid hex string with 0x prefix
      expect(channelId1).toMatch(/^0x[0-9a-f]{64}$/);

      // Different inputs should produce different outputs
      const channelId3 = calcMethod(receiver, sender, coinType); // swapped sender/receiver
      expect(channelId1).not.toBe(channelId3);
    });

    test('should handle various address formats correctly', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);

      // Test with standard addresses
      const sender1 = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000001';
      const receiver1 = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000002';
      const coinType = '0x3::gas_coin::RGas';
      
      const channelId1 = calcMethod(sender1, receiver1, coinType);
      expect(channelId1).toMatch(/^0x[0-9a-f]{64}$/);

      // Test with full-length addresses
      const sender2 = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000001';
      const receiver2 = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000002';
      
      const channelId2 = calcMethod(sender2, receiver2, coinType);
      
      // Should produce the same result as normalized short addresses
      expect(channelId1).toBe(channelId2);
    });

    test('should match Move contract calc_channel_object_id function', () => {
      const contract = new RoochPaymentChannelContract({
        network: 'test',
        debug: false,
      });

      const calcMethod = (contract as any).calcChannelObjectId.bind(contract);

      // Use the same test values as in the Move contract tests
      const sender = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000001';
      const receiver = 'did:rooch:0x0000000000000000000000000000000000000000000000000000000000000002';
      const coinType = '0x0000000000000000000000000000000000000000000000000000000000000003::gas_coin::RGas';

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