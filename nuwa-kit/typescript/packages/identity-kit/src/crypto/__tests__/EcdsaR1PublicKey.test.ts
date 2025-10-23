// Copyright (c) RoochNetwork
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from '@jest/globals';
import { EcdsaR1PublicKey } from '../EcdsaR1PublicKey';
import { SIGNATURE_SCHEME_TO_FLAG } from '@roochnetwork/rooch-sdk';

describe('EcdsaR1PublicKey', () => {
  // Test with a valid P-256 compressed public key (33 bytes)
  const validCompressedPublicKey = new Uint8Array([
    0x02, 0x58, 0xa6, 0x18, 0x06, 0x68, 0x14, 0x09, 0x8f, 0x8d, 0xdb, 0x3c, 0xbd, 0xe7, 0x38, 0x38,
    0xb5, 0x90, 0x28, 0xd8, 0x43, 0x95, 0x80, 0x31, 0xe5, 0x0b, 0xe0, 0xa5, 0xf4, 0xb0, 0xa9, 0x79,
    0x6d,
  ]);

  it('should create EcdsaR1PublicKey from Uint8Array', () => {
    const publicKey = new EcdsaR1PublicKey(validCompressedPublicKey);
    expect(publicKey.toBytes()).toEqual(validCompressedPublicKey);
  });

  it('should create EcdsaR1PublicKey from base64 string', () => {
    const base64Key = Buffer.from(validCompressedPublicKey).toString('base64');
    const publicKey = new EcdsaR1PublicKey(base64Key);
    expect(publicKey.toBytes()).toEqual(validCompressedPublicKey);
  });

  it('should throw error for invalid key length', () => {
    const invalidKey = new Uint8Array(32); // Wrong length
    expect(() => new EcdsaR1PublicKey(invalidKey)).toThrow(
      'Invalid public key input. Expected 33 bytes, got 32'
    );
  });

  it('should return correct signature scheme flag', () => {
    const publicKey = new EcdsaR1PublicKey(validCompressedPublicKey);
    expect(publicKey.flag()).toBe(SIGNATURE_SCHEME_TO_FLAG.EcdsaR1);
  });

  it('should generate valid Rooch address', () => {
    const publicKey = new EcdsaR1PublicKey(validCompressedPublicKey);
    const address = publicKey.toAddress();
    expect(address).toBeDefined();
    // Rooch addresses can be in bech32 format (rooch1...) or hex format (0x...)
    const addressStr = address.toStr();
    expect(addressStr).toMatch(/^(rooch1[a-z0-9]+|0x[a-fA-F0-9]{64})$/);
  });

  it('should compare public keys correctly', () => {
    const publicKey1 = new EcdsaR1PublicKey(validCompressedPublicKey);
    const publicKey2 = new EcdsaR1PublicKey(validCompressedPublicKey);
    const differentKey = new Uint8Array(33);
    differentKey[0] = 0x03; // Different compressed format
    differentKey.set(validCompressedPublicKey.slice(1), 1);
    const publicKey3 = new EcdsaR1PublicKey(differentKey);

    expect(publicKey1.equals(publicKey2)).toBe(true);
    expect(publicKey1.equals(publicKey3)).toBe(false);
  });

  it('should handle verify method gracefully', async () => {
    const publicKey = new EcdsaR1PublicKey(validCompressedPublicKey);
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const invalidSignature = new Uint8Array(64);

    // Should not throw error, but return false for invalid signature
    const result = await publicKey.verify(message, invalidSignature);
    expect(result).toBe(false);
  });
});
