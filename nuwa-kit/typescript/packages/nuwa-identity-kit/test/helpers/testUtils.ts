import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship, SignerInterface, MasterIdentity, KEY_TYPE, KeyType } from '../../src/types';
import { CryptoUtils } from '../../src/cryptoUtils';
// For Node.js environments
import { Buffer } from 'buffer';

/**
 * Creates a test DID document
 * @param did The DID to use
 * @returns A test DID document
 */
export function createTestDIDDocument(did: string): DIDDocument {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    controller: did,
    verificationMethod: [],
    authentication: [],
    assertionMethod: [],
    capabilityInvocation: [],
    capabilityDelegation: []
  };
}

/**
 * Creates a test verification method
 * @param id The ID of the verification method
 * @returns A test verification method
 */
export function createTestVerificationMethod(id: string): VerificationMethod {
  return {
    id,
    type: KEY_TYPE.ED25519,
    controller: id.split('#')[0],
    publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
  };
}

/**
 * Creates a test service
 * @param id The ID of the service
 * @returns A test service
 */
export function createTestService(id: string): ServiceEndpoint {
  return {
    id,
    type: 'TestService',
    serviceEndpoint: 'https://example.com/test'
  };
}

/**
 * Creates a mock private key for testing
 * This should only be used in tests, not in production
 * 
 * @returns A mock private key as Uint8Array
 */
export function createMockPrivateKey(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
}

/**
 * Creates a mock CryptoKey for testing
 * This should only be used in tests, not in production
 * 
 * @returns A mock CryptoKey object
 */
export function createMockCryptoKey(): CryptoKey {
  return {
    type: 'private',
    extractable: false,
    algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
    usages: ['sign']
  } as CryptoKey;
}

/**
 * A simple mock implementation of a signer interface for testing
 * This implements the SignerInterface from the source code
 */
export class MockSigner implements SignerInterface {
  private keys: Map<string, Uint8Array> = new Map();
  
  constructor(keyMap?: Map<string, Uint8Array>) {
    if (keyMap) {
      this.keys = keyMap;
    }
  }
  
  addKey(keyId: string, privateKey: Uint8Array | CryptoKey): void {
    // If it's a CryptoKey, convert to Uint8Array for simplicity in tests
    if (privateKey instanceof Uint8Array) {
      this.keys.set(keyId, privateKey);
    } else {
      // For testing, we treat CryptoKey objects as if they are Uint8Arrays by creating a dummy Uint8Array
      this.keys.set(keyId, new Uint8Array([1, 2, 3, 4]));
    }
  }
  
  async sign(data: Uint8Array, keyId: string): Promise<string> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }
    
    // For test purposes, just return some deterministic value based on the input
    const signature = new Uint8Array(64);
    for (let i = 0; i < Math.min(data.length, 32); i++) {
      signature[i] = data[i];
      signature[i + 32] = data[i] ^ key[i % key.length];
    }
    
    // For testing, we'll create a simple base64-like string without actually encoding
    return 'TEST_SIGNATURE_' + Array.from(signature)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  
  async canSign(keyId: string): Promise<boolean> {
    return this.keys.has(keyId);
  }
}

/**
 * Creates test options with a mock signer
 * 
 * @param keyId The key ID to use for signing
 * @param privateKey Optional private key to use, creates a new one if not provided
 * @returns Options object with a mock signer
 */
export function createTestOptionsWithSigner(keyId: string, privateKey?: Uint8Array): any {
  const key = privateKey || createMockPrivateKey();
  const mockSigner = new MockSigner();
  mockSigner.addKey(keyId, key);
  
  return {
    keyId,
    signer: mockSigner
  };
}

/**
 * Creates a test master identity
 * @param method The DID method to use
 * @param keyType Optional key type to use (Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019)
 * @param masterKeyIdFragment Optional master key ID fragment
 * @returns A test master identity
 */
export async function createTestMasterIdentity(
  method: string,
  keyType?: KeyType,
  masterKeyIdFragment?: string
): Promise<MasterIdentity> {
  // Generate a test key pair
  const actualKeyType = keyType || KEY_TYPE.ED25519;
  const keyPair = await CryptoUtils.generateKeyPair(actualKeyType);
  const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(keyPair.publicKey as Uint8Array, actualKeyType);
  const did = `did:${method}:${publicKeyMultibase}`;
  const keyId = `${did}#${masterKeyIdFragment || publicKeyMultibase}`;
  
  return {
    did,
    masterKeyId: keyId,
    masterPublicKeyMultibase: publicKeyMultibase,
    masterPrivateKey: keyPair.privateKey
  };
}
