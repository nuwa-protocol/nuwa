import { describe, test, expect } from '@jest/globals';
import { deriveFieldKeyFromString } from '../ChannelUtils';


describe('ChannelUtils', () => {

    test('should derive FieldKey correctly for string "1"', () => {
      // Expected result from Rust test case:
      // field_key_derive_test("1", "0x5c01fed5cc173458597a3d55ec9942f1a385d5aa66f15e3615378d8a773e4d58");
      const expected = "0x5c01fed5cc173458597a3d55ec9942f1a385d5aa66f15e3615378d8a773e4d58";
      const result = deriveFieldKeyFromString("1");
      
      expect(result).toBe(expected);
    });

    test('should derive FieldKey correctly for various VM ID fragments', () => {
      // Test different types of VM ID fragments that might be used in sub-channels
      const testCases = [
        "vm_id_1",
        "test_fragment",
        "user_session_123",
        "channel_abc",
        "",  // empty string test
      ];

      testCases.forEach(vmIdFragment => {
        const result = deriveFieldKeyFromString(vmIdFragment);
        
        // Should always return a valid hex string with 0x prefix
        expect(result).toMatch(/^0x[0-9a-f]{64}$/);
        expect(result.length).toBe(66); // 0x + 64 hex chars = 66 total
      });
    });

    test('should be deterministic - same input produces same output', () => {
      const vmIdFragment = "test_vm_id";
      const result1 = deriveFieldKeyFromString(vmIdFragment);
      const result2 = deriveFieldKeyFromString(vmIdFragment);
      
      expect(result1).toBe(result2);
    });

    test('should produce different results for different inputs', () => {
      const result1 = deriveFieldKeyFromString("vm_id_1");
      const result2 = deriveFieldKeyFromString("vm_id_2");
      
    expect(result1).not.toBe(result2);
  });

}); 