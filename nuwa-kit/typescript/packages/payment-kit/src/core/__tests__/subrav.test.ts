/**
 * Tests for SubRAV BCS serialization, signing, and verification utilities
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  SubRAVCodec,
  SubRAVUtils,
  SubRAVSigner,
  CURRENT_SUBRAV_VERSION,
  SUBRAV_VERSION_1,
} from '../SubRav';
import type { SubRAV, SignedSubRAV } from '../types';
import type { DIDDocument } from '@nuwa-ai/identity-kit';
import {
  TestSignerFactory,
  MockDIDResolver,
  createTestEnvironment,
} from '../../test-helpers/mocks';
import { assertSubRavProgression } from '../RavVerifier';

describe('SubRAV BCS Serialization', () => {
  const sampleSubRAV: SubRAV = {
    version: SUBRAV_VERSION_1,
    chainId: BigInt(4),
    channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
    channelEpoch: BigInt(0),
    vmIdFragment: 'account-key',
    accumulatedAmount: BigInt(10000),
    nonce: BigInt(1),
  };

  test('should encode and decode SubRAV correctly', () => {
    // Encode SubRAV to bytes
    const encoded = SubRAVCodec.encode(sampleSubRAV);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);

    // Decode back to SubRAV
    const decoded = SubRAVCodec.decode(encoded);

    // Verify all fields match
    expect(decoded.version).toBe(sampleSubRAV.version);
    expect(decoded.chainId).toBe(sampleSubRAV.chainId);
    expect(decoded.channelId).toBe(sampleSubRAV.channelId);
    expect(decoded.channelEpoch).toBe(sampleSubRAV.channelEpoch);
    expect(decoded.vmIdFragment).toBe(sampleSubRAV.vmIdFragment);
    expect(decoded.accumulatedAmount).toBe(sampleSubRAV.accumulatedAmount);
    expect(decoded.nonce).toBe(sampleSubRAV.nonce);
  });

  test('should convert to/from hex string', () => {
    const hex = SubRAVCodec.toHex(sampleSubRAV);
    expect(hex).toMatch(/^0x[0-9a-f]+$/);

    const fromHex = SubRAVCodec.fromHex(hex);
    expect(fromHex).toEqual(sampleSubRAV);
  });

  test('should handle large numbers correctly', () => {
    const largeSubRAV: SubRAV = {
      ...sampleSubRAV,
      chainId: BigInt('18446744073709551615'), // max u64
      accumulatedAmount: BigInt(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      ), // max u256
      nonce: BigInt('18446744073709551615'), // max u64
    };

    const encoded = SubRAVCodec.encode(largeSubRAV);
    const decoded = SubRAVCodec.decode(encoded);

    expect(decoded.chainId).toBe(largeSubRAV.chainId);
    expect(decoded.accumulatedAmount).toBe(largeSubRAV.accumulatedAmount);
    expect(decoded.nonce).toBe(largeSubRAV.nonce);
  });

  test('should handle encoding errors gracefully', () => {
    const invalidSubRAV = {
      ...sampleSubRAV,
      chainId: BigInt(-1), // Negative values should cause BCS encoding error
    };

    expect(() => SubRAVCodec.encode(invalidSubRAV)).toThrow();
  });

  test('should handle decoding errors gracefully', () => {
    const invalidBytes = new Uint8Array([1, 2, 3, 4, 5]);

    expect(() => SubRAVCodec.decode(invalidBytes)).toThrow('Failed to decode SubRAV');
  });
});

describe('SubRAV Signing and Verification', () => {
  const sampleSubRAV: SubRAV = {
    version: SUBRAV_VERSION_1,
    chainId: BigInt(4),
    channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
    channelEpoch: BigInt(0),
    vmIdFragment: 'account-key',
    accumulatedAmount: BigInt(10000),
    nonce: BigInt(1),
  };

  let testEnv: any;

  beforeEach(async () => {
    testEnv = await createTestEnvironment('subrav-test');
  });

  test('should sign SubRAV correctly', async () => {
    const signedSubRAV = await SubRAVSigner.sign(
      sampleSubRAV,
      testEnv.payerSigner,
      testEnv.payerKeyId
    );

    expect(signedSubRAV.subRav).toEqual(sampleSubRAV);
    expect(signedSubRAV.signature).toBeInstanceOf(Uint8Array);
    expect(signedSubRAV.signature.length).toBe(64);
  });

  test('should verify SubRAV with DID document', async () => {
    const signedSubRAV = await SubRAVSigner.sign(
      sampleSubRAV,
      testEnv.payerSigner,
      testEnv.payerKeyId
    );

    const didDocument = await testEnv.didResolver.resolveDID(testEnv.payerDid);
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      didDocument: didDocument!,
    });

    expect(isValid).toBe(true);
  });

  test('should verify SubRAV with DID resolver', async () => {
    const signedSubRAV = await SubRAVSigner.sign(
      sampleSubRAV,
      testEnv.payerSigner,
      testEnv.payerKeyId
    );

    const isValid = await SubRAVSigner.verifyWithResolver(
      signedSubRAV,
      testEnv.payerDid,
      testEnv.didResolver
    );

    expect(isValid).toBe(true);
  });

  test('should reject invalid signature', async () => {
    const signedSubRAV = await SubRAVSigner.sign(
      sampleSubRAV,
      testEnv.payerSigner,
      testEnv.payerKeyId
    );

    // Modify signature to make it invalid
    signedSubRAV.signature[0] = signedSubRAV.signature[0] ^ 0xff;

    const didDocument = await testEnv.didResolver.resolveDID(testEnv.payerDid);
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      didDocument: didDocument!,
    });

    expect(isValid).toBe(false);
  });

  test('should handle verification errors gracefully', async () => {
    const signedSubRAV = await SubRAVSigner.sign(
      sampleSubRAV,
      testEnv.payerSigner,
      testEnv.payerKeyId
    );

    const emptyDIDDoc: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: testEnv.payerDid,
      verificationMethod: [], // Empty verification methods
    };

    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      didDocument: emptyDIDDoc,
    });

    expect(isValid).toBe(false);
  });
});

describe('SubRAVUtils', () => {
  test('should create SubRAV with default version', () => {
    const subRav = SubRAVUtils.create({
      chainId: BigInt(4),
      channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
      channelEpoch: BigInt(0),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(1000),
      nonce: BigInt(1),
    });

    expect(subRav.version).toBe(CURRENT_SUBRAV_VERSION);
  });

  test('should create SubRAV with custom version', () => {
    const customVersion = 2;
    const subRav = SubRAVUtils.create({
      version: customVersion,
      chainId: BigInt(4),
      channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
      channelEpoch: BigInt(0),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(1000),
      nonce: BigInt(1),
    });

    expect(subRav.version).toBe(customVersion);
  });

  test('should check version support correctly', () => {
    expect(SubRAVUtils.isSupportedVersion(1)).toBe(true);
    expect(SubRAVUtils.isSupportedVersion(2)).toBe(false);
    expect(SubRAVUtils.isSupportedVersion(0)).toBe(false);
  });
});

describe('Rav progression assertions', () => {
  const base: SubRAV = {
    version: SUBRAV_VERSION_1,
    chainId: BigInt(4),
    channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
    channelEpoch: BigInt(0),
    vmIdFragment: 'test-key',
    accumulatedAmount: BigInt(1000),
    nonce: BigInt(1),
  };

  test('should accept monotonic progression', () => {
    const prev: SubRAV = { ...base, nonce: 1n, accumulatedAmount: 1000n };
    const next: SubRAV = { ...base, nonce: 2n, accumulatedAmount: 2000n };
    expect(() => assertSubRavProgression(prev, next)).not.toThrow();
  });

  test('should reject non-monotonic nonce', () => {
    const prev: SubRAV = { ...base, nonce: 2n, accumulatedAmount: 1000n };
    const next: SubRAV = { ...base, nonce: 1n, accumulatedAmount: 2000n };
    expect(() => assertSubRavProgression(prev, next)).toThrow('Invalid nonce');
  });

  test('should reject decreasing accumulated amount', () => {
    const prev: SubRAV = { ...base, nonce: 1n, accumulatedAmount: 2000n };
    const next: SubRAV = { ...base, nonce: 2n, accumulatedAmount: 1000n };
    expect(() => assertSubRavProgression(prev, next)).toThrow('Amount must increase');
  });
});
