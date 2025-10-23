// Copyright (c) RoochNetwork
// SPDX-License-Identifier: Apache-2.0

import { p256 } from '@noble/curves/p256';
import {
  RoochAddress,
  PublicKey,
  PublicKeyInitData,
  SIGNATURE_SCHEME_TO_FLAG,
  Address,
  Bytes,
  blake2b,
  fromB64,
} from '@roochnetwork/rooch-sdk';
import { IdentityKitErrorCode, createValidationError } from '../errors';

const PUBLIC_KEY_SIZE = 33; // Compressed P-256 public key size

/**
 * An ECDSA R1 (P-256) public key implementation for identity-kit
 * This is a temporary implementation until EcdsaR1PublicKey is available in rooch-sdk
 */
export class EcdsaR1PublicKey extends PublicKey<Address> {
  static SIZE = PUBLIC_KEY_SIZE;

  private readonly data: Uint8Array;

  /**
   * Create a new EcdsaR1PublicKey object
   * @param value ECDSA R1 public key as buffer or base-64 encoded string
   */
  constructor(value: PublicKeyInitData) {
    super();

    if (typeof value === 'string') {
      this.data = fromB64(value);
    } else if (value instanceof Uint8Array) {
      this.data = value;
    } else {
      this.data = Uint8Array.from(value);
    }

    if (this.data.length !== PUBLIC_KEY_SIZE) {
      throw createValidationError(
        IdentityKitErrorCode.INVALID_INPUT_FORMAT,
        `Invalid public key input. Expected ${PUBLIC_KEY_SIZE} bytes, got ${this.data.length}`,
        { expectedSize: PUBLIC_KEY_SIZE, actualSize: this.data.length, keyType: 'ECDSA-R1' }
      );
    }
  }

  /**
   * Checks if two EcdsaR1 public keys are equal
   */
  override equals(publicKey: EcdsaR1PublicKey): boolean {
    return super.equals(publicKey);
  }

  /**
   * Return the byte array representation of the ECDSA R1 public key
   */
  toBytes(): Uint8Array {
    return this.data;
  }

  /**
   * Return the signature scheme flag for ECDSA R1
   */
  flag(): number {
    return SIGNATURE_SCHEME_TO_FLAG.EcdsaR1;
  }

  /**
   * Verifies that the signature is valid for the provided message
   */
  async verify(message: Uint8Array, signature: Uint8Array): Promise<boolean> {
    try {
      // Verify signature using noble curves with compressed public key bytes
      return p256.verify(signature, message, this.toBytes());
    } catch (error) {
      return false;
    }
  }

  /**
   * Return the Rooch address associated with this ECDSA R1 public key
   */
  toAddress(): RoochAddress {
    const tmp = new Uint8Array(PUBLIC_KEY_SIZE + 1);
    tmp.set([SIGNATURE_SCHEME_TO_FLAG.EcdsaR1]);
    tmp.set(this.toBytes(), 1);

    // Each hex char represents half a byte, hence hex address doubles the length
    const ROOCH_ADDRESS_LENGTH = 32;
    return new RoochAddress(blake2b(tmp, { dkLen: 32 }).slice(0, ROOCH_ADDRESS_LENGTH * 2));
  }
}
