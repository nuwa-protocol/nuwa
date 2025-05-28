import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { 
  NuwaIdentityKit,
  DIDDocument,
  SignerInterface,
  DIDCreationRequest,
  OperationalKeyInfo,
  ServiceInfo,
  VerificationRelationship,
  SignedData,
  KEY_TYPE
} from '../src';
import { CryptoUtils } from '../src/cryptoUtils';
import { KeyVDR } from '../src/vdr/keyVDR';
import { MockSigner, createMockPrivateKey } from './helpers/testUtils';

describe('NuwaIdentityKit', () => {
  let keyVDR: KeyVDR;
  let testDID: string;
  let mockDIDDocument: DIDDocument;
  let mockSigner: MockSigner;
  let keyId: string;

  beforeEach(async () => {
    // Generate a new key pair
    const { publicKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
    testDID = `did:key:${publicKeyMultibase}`;
    keyId = `${testDID}#account-key`;

    // Create DID Document
    mockDIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1'
      ],
      id: testDID,
      controller: [testDID],
      verificationMethod: [{
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: testDID,
        publicKeyMultibase
      }],
      authentication: [keyId],
      assertionMethod: [keyId],
      capabilityInvocation: [keyId],
      capabilityDelegation: [keyId],
      service: []
    };

    // Initialize KeyVDR
    keyVDR = new KeyVDR();
    // Reset cache
    keyVDR.reset();

    // Initialize MockSigner
    mockSigner = new MockSigner();
    mockSigner.addKey(keyId, createMockPrivateKey());
  });

  describe('Initialization', () => {
    it('should create instance from existing DID', async () => {
      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID
      });

      const kit = await NuwaIdentityKit.fromExistingDID(testDID, [keyVDR]);
      expect(kit).toBeInstanceOf(NuwaIdentityKit);
      expect(kit.getDIDDocument()).toEqual(mockDIDDocument);
    });

    it('should create instance from DID Document', () => {
      const kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
      expect(kit).toBeInstanceOf(NuwaIdentityKit);
      expect(kit.getDIDDocument()).toEqual(mockDIDDocument);
    });

    it('should create new DID', async () => {
      const { publicKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
      const did = `did:key:${publicKeyMultibase}`;
      
      const creationRequest: DIDCreationRequest = {
        publicKeyMultibase,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did
      };

      const kit = await NuwaIdentityKit.createNewDID(creationRequest, keyVDR, mockSigner);
      expect(kit).toBeInstanceOf(NuwaIdentityKit);
      expect(kit.getDIDDocument().id).toMatch(/^did:key:/);
    });
  });

  describe('Service Management', () => {
    let kit: NuwaIdentityKit;

    beforeEach(async () => {
      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID
      });

      kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
      kit.registerVDR(keyVDR);
    });

    it('should add service', async () => {
      const serviceInfo: ServiceInfo = {
        type: 'MessagingService',
        serviceEndpoint: 'https://example.com/messaging',
        idFragment: 'messaging',
        additionalProperties: {}
      };

      const serviceId = await kit.addService(serviceInfo, {
        keyId: `${testDID}#account-key`
      });

      expect(serviceId).toBe(`${testDID}#messaging`);
    });

    it('should remove service', async () => {
      const result = await kit.removeService(`${testDID}#messaging`, {
        keyId: `${testDID}#account-key`
      });

      expect(result).toBe(true);
    });
  });

  describe('Signature Operations', () => {
    let kit: NuwaIdentityKit;
    const mockPrivateKey = new Uint8Array([1, 2, 3, 4, 5]);
    const mockOperationalKeys = new Map<string, Uint8Array>();

    beforeEach(async () => {
      mockOperationalKeys.set(`${testDID}#account-key`, mockPrivateKey);
      kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument, {
        operationalPrivateKeys: mockOperationalKeys
      });
      kit.registerVDR(keyVDR);

      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID
      });
    });

    it('should create NIP1 signature', async () => {
      // Mock CryptoUtils.sign to return a predictable signature
      jest.spyOn(CryptoUtils, 'sign').mockResolvedValue('mockSignature');

      const payload: Omit<SignedData, 'nonce' | 'timestamp'> = {
        operation: 'test',
        params: { test: 'value' }
      };

      const signedObject = await kit.createNIP1Signature(payload, `${testDID}#account-key`);
      
      expect(signedObject).toHaveProperty('signed_data');
      expect(signedObject.signed_data).toHaveProperty('operation', 'test');
      expect(signedObject.signed_data).toHaveProperty('params');
      expect(signedObject.signed_data).toHaveProperty('nonce');
      expect(signedObject.signed_data).toHaveProperty('timestamp');
      expect(signedObject).toHaveProperty('signature');
      expect(signedObject.signature).toHaveProperty('signer_did', testDID);
      expect(signedObject.signature).toHaveProperty('key_id', `${testDID}#account-key`);
      expect(signedObject.signature).toHaveProperty('value', 'mockSignature');
    });

    it('should verify NIP1 signature', async () => {
      // Mock CryptoUtils.verify to return true
      jest.spyOn(CryptoUtils, 'verify').mockResolvedValue(true);

      const signedObject = {
        signed_data: {
          operation: 'test',
          params: { test: 'value' },
          nonce: '123',
          timestamp: Math.floor(Date.now() / 1000)
        },
        signature: {
          signer_did: testDID,
          key_id: `${testDID}#account-key`,
          value: 'mockSignature'
        }
      };

      const isValid = await NuwaIdentityKit.verifyNIP1Signature(signedObject, mockDIDDocument);
      expect(isValid).toBe(true);
    });
  });

  describe('DID Resolution', () => {
    let kit: NuwaIdentityKit;

    beforeEach(async () => {
      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID
      });

      kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
      kit.registerVDR(keyVDR);
    });

    it('should resolve DID', async () => {
      const resolved = await kit.resolveDID(testDID);
      expect(resolved).toEqual(mockDIDDocument);
    });

    it('should check if DID exists', async () => {
      const exists = await kit.didExists(testDID);
      expect(exists).toBe(true);
    });

    it('should return null when DID resolution fails', async () => {
      const kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
      kit.registerVDR(keyVDR);
      const resolved = await kit.resolveDID('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(resolved).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no VDR available for DID method', async () => {
      const kit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
      await expect(kit.resolveDID(testDID)).rejects.toThrow();
    });
  });
});
