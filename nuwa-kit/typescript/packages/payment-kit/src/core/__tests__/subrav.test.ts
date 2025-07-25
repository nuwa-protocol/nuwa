/**
 * Tests for SubRAV BCS serialization, signing, and verification utilities
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { 
  SubRAVCodec, 
  SubRAVUtils, 
  SubRAVValidator, 
  SubRAVSigner,
  SubRAVManager,
  CURRENT_SUBRAV_VERSION,
  SUBRAV_VERSION_1 
} from '../subrav';
import type { SubRAV, SignedSubRAV } from '../types';
import type { DIDDocument, KeyType } from '@nuwa-ai/identity-kit';

// Simple mock implementations for testing
const createMockSigner = () => ({
  getDid: async () => 'did:example:payer',
  signWithKeyId: async (data: Uint8Array, keyId: string) => {
    // Simple mock signature: just return first 64 bytes of data + keyId hash
    const keyIdBytes = new TextEncoder().encode(keyId);
    const signature = new Uint8Array(64);
    signature.set(data.slice(0, 32), 0);
    signature.set(keyIdBytes.slice(0, 32), 32);
    return signature;
  },
});

const createMockDIDResolver = () => ({
  resolveDID: async (did: string): Promise<DIDDocument | null> => {
    if (did === 'did:example:payer') {
      return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [
          {
            id: `${did}#account-key`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          }
        ]
      };
    }
    return null;
  },
});

// Mock the identity-kit module
jest.mock('@nuwa-ai/identity-kit', () => ({
  CryptoUtils: {
    verify: (data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array, keyType: string) => {
      // Simple mock verification: check if signature starts with first 32 bytes of data
      return signature.slice(0, 32).every((byte, index) => byte === data[index]);
    },
  },
  MultibaseCodec: {
    decodeBase58btc: (encoded: string) => {
      // Mock decoder - return fixed 32-byte key
      return new Uint8Array(32).fill(42);
    },
  },
}));

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
      accumulatedAmount: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'), // max u256
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

  let mockSigner: any;
  let mockDIDResolver: any;

  beforeEach(() => {
    mockSigner = createMockSigner();
    mockDIDResolver = createMockDIDResolver();
  });

  test('should sign SubRAV correctly', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    expect(signedSubRAV.subRav).toEqual(sampleSubRAV);
    expect(signedSubRAV.signature).toBeInstanceOf(Uint8Array);
    expect(signedSubRAV.signature.length).toBe(64);
  });

  test('should verify SubRAV with public key', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const mockPublicKey = new Uint8Array(32).fill(42);
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      publicKey: mockPublicKey,
      keyType: 'Ed25519VerificationKey2020' as KeyType
    });
    
    expect(isValid).toBe(true);
  });

  test('should verify SubRAV with DID document', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const mockDIDDoc: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:example:payer',
      verificationMethod: [
        {
          id: 'did:example:payer#account-key',
          type: 'Ed25519VerificationKey2020',
          controller: 'did:example:payer',
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        }
      ]
    };
    
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      didDocument: mockDIDDoc,
    });
    
    expect(isValid).toBe(true);
  });

  test('should verify SubRAV with DID resolver', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const isValid = await SubRAVSigner.verifyWithResolver(
      signedSubRAV,
      'did:example:payer',
      mockDIDResolver
    );
    
    expect(isValid).toBe(true);
  });

  test('should reject invalid signature', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    // Modify signature to make it invalid
    signedSubRAV.signature[0] = signedSubRAV.signature[0] ^ 0xFF;
    
    const mockPublicKey = new Uint8Array(32).fill(42);
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      publicKey: mockPublicKey,
      keyType: 'Ed25519VerificationKey2020' as KeyType
    });
    
    expect(isValid).toBe(false);
  });

  test('should handle verification errors gracefully', async () => {
    const signedSubRAV = await SubRAVSigner.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const emptyDIDDoc: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:example:payer',
      verificationMethod: [] // Empty verification methods
    };
    
    const isValid = await SubRAVSigner.verify(signedSubRAV, {
      didDocument: emptyDIDDoc,
    });
    
    expect(isValid).toBe(false);
  });
});

describe('SubRAVManager', () => {
  const sampleSubRAV: SubRAV = {
    version: SUBRAV_VERSION_1,
    chainId: BigInt(4),
    channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
    channelEpoch: BigInt(0),
    vmIdFragment: 'account-key',
    accumulatedAmount: BigInt(10000),
    nonce: BigInt(1),
  };

  let mockSigner: any;
  let mockDIDResolver: any;

  beforeEach(() => {
    mockSigner = createMockSigner();
    mockDIDResolver = createMockDIDResolver();
  });

  test('should sign through manager', async () => {
    const manager = new SubRAVManager();
    const signedSubRAV = await manager.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    expect(signedSubRAV.subRav).toEqual(sampleSubRAV);
    expect(signedSubRAV.signature).toBeInstanceOf(Uint8Array);
  });

  test('should verify through manager with public key', async () => {
    const manager = new SubRAVManager();
    const signedSubRAV = await manager.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const mockPublicKey = new Uint8Array(32).fill(42);
    const isValid = await manager.verify(signedSubRAV, {
      publicKey: mockPublicKey,
      keyType: 'Ed25519VerificationKey2020' as KeyType
    });
    
    expect(isValid).toBe(true);
  });

  test('should verify through manager with resolver', async () => {
    const manager = new SubRAVManager();
    const signedSubRAV = await manager.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const isValid = await manager.verifyWithResolver(
      signedSubRAV,
      'did:example:payer',
      mockDIDResolver
    );
    
    expect(isValid).toBe(true);
  });

  test('should validate SubRAV business logic', async () => {
    const manager = new SubRAVManager();
    const signedSubRAV = await manager.sign(sampleSubRAV, mockSigner, 'did:example:payer#account-key');
    
    const isValid = await manager.validate(signedSubRAV);
    expect(isValid).toBe(true);
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

describe('SubRAVValidator', () => {
  const validSubRAV: SubRAV = {
    version: SUBRAV_VERSION_1,
    chainId: BigInt(4),
    channelId: '0x35df6e58502089ed640382c477e4b6f99e5e90d881678d37ed774a737fd3797c',
    channelEpoch: BigInt(0),
    vmIdFragment: 'test-key',
    accumulatedAmount: BigInt(1000),
    nonce: BigInt(1),
  };

  test('should validate correct SubRAV', () => {
    const result = SubRAVValidator.validate(validSubRAV);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject invalid version', () => {
    const invalidSubRAV = { ...validSubRAV, version: 0 };
    const result = SubRAVValidator.validate(invalidSubRAV);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Version must be a positive integer'))).toBe(true);
  });

  test('should reject unsupported version', () => {
    const invalidSubRAV = { ...validSubRAV, version: 99 };
    const result = SubRAVValidator.validate(invalidSubRAV);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Unsupported SubRAV version'))).toBe(true);
  });

  test('should reject invalid channel ID', () => {
    const invalidSubRAV = { ...validSubRAV, channelId: 'invalid' };
    const result = SubRAVValidator.validate(invalidSubRAV);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid channel ID format'))).toBe(true);
  });

  test('should validate sequence correctly', () => {
    const prev: SubRAV = { ...validSubRAV, nonce: BigInt(1), accumulatedAmount: BigInt(1000) };
    const current: SubRAV = { ...validSubRAV, nonce: BigInt(2), accumulatedAmount: BigInt(2000) };

    const result = SubRAVValidator.validateSequence(prev, current);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject non-monotonic nonce', () => {
    const prev: SubRAV = { ...validSubRAV, nonce: BigInt(2), accumulatedAmount: BigInt(1000) };
    const current: SubRAV = { ...validSubRAV, nonce: BigInt(1), accumulatedAmount: BigInt(2000) };

    const result = SubRAVValidator.validateSequence(prev, current);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Nonce must be strictly increasing'))).toBe(true);
  });

  test('should reject decreasing accumulated amount', () => {
    const prev: SubRAV = { ...validSubRAV, nonce: BigInt(1), accumulatedAmount: BigInt(2000) };
    const current: SubRAV = { ...validSubRAV, nonce: BigInt(2), accumulatedAmount: BigInt(1000) };

    const result = SubRAVValidator.validateSequence(prev, current);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Accumulated amount cannot decrease'))).toBe(true);
  });
}); 