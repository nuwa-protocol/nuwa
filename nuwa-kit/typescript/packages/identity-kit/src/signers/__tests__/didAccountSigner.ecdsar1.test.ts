// Copyright (c) RoochNetwork
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from '@jest/globals';
import { DidAccountSigner } from '../didAccountSigner';
import { KeyType } from '../../types/crypto';
import { EcdsaR1PublicKey } from '../../crypto/EcdsaR1PublicKey';
import { SignerInterface } from '../types';

// Mock signer that implements SignerInterface for ECDSA R1
class MockEcdsaR1Signer implements SignerInterface {
  private did = 'did:rooch:0x1234567890abcdef1234567890abcdef12345678';
  private keyId = 'did:rooch:0x1234567890abcdef1234567890abcdef12345678#key-1';
  private publicKey = new Uint8Array([
    0x02, 0x58, 0xa6, 0x18, 0x06, 0x68, 0x14, 0x09, 0x8f, 0x8d, 0xdb, 0x3c, 0xbd, 0xe7, 0x38, 0x38,
    0xb5, 0x90, 0x28, 0xd8, 0x43, 0x95, 0x80, 0x31, 0xe5, 0x0b, 0xe0, 0xa5, 0xf4, 0xb0, 0xa9, 0x79,
    0x6d,
  ]);

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Key ID mismatch. Expected ${this.keyId}, got ${keyId}`);
    }
    // Return a mock signature (64 bytes for ECDSA R1)
    return new Uint8Array(64);
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }

  async listKeyIds(): Promise<string[]> {
    return [this.keyId];
  }

  async getDid(): Promise<string> {
    return this.did;
  }

  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    if (keyId !== this.keyId) {
      return undefined;
    }
    return {
      type: KeyType.ECDSAR1,
      publicKey: this.publicKey,
    };
  }
}

describe('DidAccountSigner ECDSA R1 Support', () => {
  it('should create DidAccountSigner with ECDSA R1 key', async () => {
    const mockSigner = new MockEcdsaR1Signer();
    const didSigner = await DidAccountSigner.create(mockSigner);

    expect(didSigner).toBeDefined();
    expect(didSigner.getKeyScheme()).toBe('EcdsaR1');
  });

  it('should return EcdsaR1PublicKey from getPublicKey', async () => {
    const mockSigner = new MockEcdsaR1Signer();
    const didSigner = await DidAccountSigner.create(mockSigner);

    const publicKey = didSigner.getPublicKey();
    expect(publicKey).toBeInstanceOf(EcdsaR1PublicKey);
    expect(publicKey.flag()).toBe(0x02); // ECDSA R1 flag
  });

  it('should generate valid Rooch address for ECDSA R1', async () => {
    const mockSigner = new MockEcdsaR1Signer();
    const didSigner = await DidAccountSigner.create(mockSigner);

    const address = didSigner.getRoochAddress();
    expect(address).toBeDefined();
    expect(address.toStr()).toMatch(/^(rooch1[a-z0-9]+|0x[a-fA-F0-9]{64})$/);
  });

  it('should sign data with ECDSA R1 key', async () => {
    const mockSigner = new MockEcdsaR1Signer();
    const didSigner = await DidAccountSigner.create(mockSigner);

    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await didSigner.sign(data);

    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // Mock signature length
  });

  it('should implement SignerInterface methods correctly', async () => {
    const mockSigner = new MockEcdsaR1Signer();
    const didSigner = await DidAccountSigner.create(mockSigner);

    // Test listKeyIds
    const keyIds = await didSigner.listKeyIds();
    expect(keyIds).toHaveLength(1);
    expect(keyIds[0]).toBe('did:rooch:0x1234567890abcdef1234567890abcdef12345678#key-1');

    // Test getDid
    const did = await didSigner.getDid();
    expect(did).toBe('did:rooch:0x1234567890abcdef1234567890abcdef12345678');

    // Test canSignWithKeyId
    const canSign = await didSigner.canSignWithKeyId(keyIds[0]);
    expect(canSign).toBe(true);

    const cannotSign = await didSigner.canSignWithKeyId('invalid-key-id');
    expect(cannotSign).toBe(false);

    // Test getKeyInfo
    const keyInfo = await didSigner.getKeyInfo(keyIds[0]);
    expect(keyInfo).toBeDefined();
    expect(keyInfo?.type).toBe(KeyType.ECDSAR1);
    expect(keyInfo?.publicKey).toHaveLength(33);
  });
});
