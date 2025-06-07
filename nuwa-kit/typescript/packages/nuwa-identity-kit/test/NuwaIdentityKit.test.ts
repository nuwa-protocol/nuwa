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
  KEY_TYPE,
  VDRRegistry
} from '../src';
import { CryptoUtils } from '../src/cryptoUtils';
import { KeyVDR } from '../src/vdr/keyVDR';
import { MockSigner} from './helpers/testUtils';

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

    // Register VDR
    VDRRegistry.getInstance().registerVDR(keyVDR);

    // Initialize MockSigner
    mockSigner = new MockSigner();
    mockSigner.generateKey(keyId);
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

      const kit = await NuwaIdentityKit.fromExistingDID(testDID);
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

      const kit = await NuwaIdentityKit.createNewDID('key', creationRequest);
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

      kit = await NuwaIdentityKit.fromExistingDID(testDID);
    });

    it('should add service', async () => {
      const serviceInfo: ServiceInfo = {
        type: 'MessagingService',
        serviceEndpoint: 'https://example.com/messaging',
        idFragment: 'messaging',
        additionalProperties: {}
      };

      const serviceId = await kit.addService(serviceInfo, {
        signer: mockSigner
      });

      expect(serviceId).toBe(`${testDID}#messaging`);
    });

    it('should remove service', async () => {
      const result = await kit.removeService(`${testDID}#messaging`, {
        signer: mockSigner
      });

      expect(result).toBe(true);
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

      kit = await NuwaIdentityKit.fromExistingDID(testDID);
    });

    it('should resolve DID', async () => {
      const resolved = await VDRRegistry.getInstance().resolveDID(testDID);
      expect(resolved).toEqual(mockDIDDocument);
    });

    it('should check if DID exists', async () => {
      const exists = await VDRRegistry.getInstance().exists(testDID);
      expect(exists).toBe(true);
    });

    it('should return null when DID resolution fails', async () => {
      const resolved = await VDRRegistry.getInstance().resolveDID('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
      expect(resolved).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no VDR available for DID method', async () => {
      VDRRegistry.getInstance().registerVDR(keyVDR);
      await expect(VDRRegistry.getInstance().resolveDID('did:example:123')).rejects.toThrow();
    });
  });
});
