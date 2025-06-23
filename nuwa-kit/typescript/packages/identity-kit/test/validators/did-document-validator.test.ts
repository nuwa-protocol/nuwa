import { IdentityKit, VDRRegistry } from '../../src';
import { DIDDocument, DIDCreationRequest, SignerInterface, KEY_TYPE } from '../../src/types';
import { validateDIDDocument } from '../../src/validators/did-document-validator';
import { CryptoUtils } from '../../src/cryptoUtils';
import { KeyVDR } from '../../src/vdr/keyVDR';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { KeyManager } from '../../src/keys/KeyManager';

describe('DID Document Validator', () => {
  let validDocument: DIDDocument;
  let keyVDR: KeyVDR;
  let mockSigner: KeyManager;

  beforeEach(async () => {
    // Initialize KeyVDR
    keyVDR = new KeyVDR();
    keyVDR.reset();
    VDRRegistry.getInstance().registerVDR(keyVDR);

    // Create mock signer
    const { keyManager: mockSigner, keyId, did } = await KeyManager.createWithDidKey();

    const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);

    // Create DID creation request
    const creationRequest: DIDCreationRequest = {
      publicKeyMultibase,
      keyType: 'Ed25519VerificationKey2020',
      preferredDID: did,
      controller: did,
    };

    // Create a new DID using IdentityKit
    const kit = await IdentityKit.createNewDID('key', creationRequest, mockSigner);
    console.log(kit.getDIDDocument());
    validDocument = kit.getDIDDocument();
  });

  it('should validate a well-formed DID document', () => {
    const result = validateDIDDocument(validDocument);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject a document without an id', () => {
    const invalidDoc = { ...validDocument };
    delete (invalidDoc as any).id;

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('DID document must have an id');
  });

  it('should reject a document with an invalid id format', () => {
    const invalidDoc = { ...validDocument, id: 'not-a-did' };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('DID document id must be a valid DID');
  });

  it('should reject a document without @context', () => {
    const invalidDoc = { ...validDocument };
    delete (invalidDoc as any)['@context'];

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('DID document must have a @context');
  });

  it('should reject a document with invalid @context format', () => {
    const invalidDoc = { ...validDocument, '@context': 'not-an-array' };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('DID document @context must be an array');
  });

  it('should reject a document with empty verification methods array', () => {
    const invalidDoc = { ...validDocument, verificationMethod: [] };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('DID document must have at least one verification method');
  });

  it('should reject a document with invalid verification method format', () => {
    const invalidDoc = {
      ...validDocument,
      verificationMethod: [
        {
          // Missing required fields
          id: 'did:example:123#key-1',
        } as any,
      ],
    };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Verification method must have a type');
    expect(result.errors).toContain('Verification method must have a controller');
  });

  it('should reject a document with invalid service format', () => {
    const invalidDoc = {
      ...validDocument,
      service: [
        {
          // Missing required fields
          id: 'did:example:123#service-1',
        } as any,
      ],
    };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Service must have a type');
    expect(result.errors).toContain('Service must have a serviceEndpoint');
  });

  it('should reject a document with invalid relationship references', () => {
    const invalidDoc = {
      ...validDocument,
      authentication: ['did:example:123#non-existent-key'],
    };

    const result = validateDIDDocument(invalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      'Authentication reference did:example:123#non-existent-key does not exist in verificationMethod'
    );
  });

  it('should validate a document with valid relationship references', () => {
    // Get the first verification method ID
    const vmId = validDocument.verificationMethod![0].id;

    const validDoc = {
      ...validDocument,
      authentication: [vmId],
      assertionMethod: [vmId],
      capabilityInvocation: [vmId],
      capabilityDelegation: [vmId],
    };

    const result = validateDIDDocument(validDoc);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
