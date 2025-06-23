import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  IdentityKit,
  DIDDocument,
  DIDCreationRequest,
  ServiceInfo,
  KeyType,
  VDRRegistry,
  KeyMultibaseCodec,
} from '../src';
import { CryptoUtils } from '../src/crypto';
import { KeyVDR } from '../src/vdr/keyVDR';
import { KeyManager } from '../src/keys/KeyManager';

describe('IdentityKit', () => {
  let keyVDR: KeyVDR;
  let testDID: string;
  let mockDIDDocument: DIDDocument;
  let signer: KeyManager;
  let keyId: string;

  beforeEach(async () => {
    // Initialize KeyVDR
    keyVDR = new KeyVDR();
    keyVDR.reset();
    VDRRegistry.getInstance().registerVDR(keyVDR);

    // Generate a key pair for the DID
    const keyPair = await CryptoUtils.generateKeyPair(KeyType.ED25519);
    const publicKeyMultibase = await KeyMultibaseCodec.encodeWithType(
      keyPair.publicKey,
      KeyType.ED25519
    );
    testDID = `did:key:${publicKeyMultibase}`;

    // Create an empty KeyManager and import the DID's key pair
    signer = KeyManager.createEmpty(testDID);
    keyId = await signer.importKeyPair('account-key', keyPair, KeyType.ED25519);

    // Create DID Document
    mockDIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: testDID,
      controller: [testDID],
      verificationMethod: [
        {
          id: keyId,
          type: 'Ed25519VerificationKey2020',
          controller: testDID,
          publicKeyMultibase,
        },
      ],
      authentication: [keyId],
      assertionMethod: [keyId],
      capabilityInvocation: [keyId],
      capabilityDelegation: [keyId],
      service: [],
    };

    // Create DID in VDR
    await keyVDR.create({
      publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
      keyType: 'Ed25519VerificationKey2020',
      preferredDID: testDID,
      controller: testDID,
      initialRelationships: [
        'authentication',
        'assertionMethod',
        'capabilityInvocation',
        'capabilityDelegation',
      ],
    });
  });

  describe('Initialization', () => {
    it('should create instance from existing DID', async () => {
      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID,
      });

      const kit = await IdentityKit.fromExistingDID(testDID, signer);
      expect(kit).toBeInstanceOf(IdentityKit);
      expect(kit.getDIDDocument()).toEqual(mockDIDDocument);
    });

    it('should create instance from DID Document', () => {
      const kit = IdentityKit.fromDIDDocument(mockDIDDocument, signer);
      expect(kit).toBeInstanceOf(IdentityKit);
      expect(kit.getDIDDocument()).toEqual(mockDIDDocument);
    });

    it('should create new DID', async () => {
      const { publicKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
      const publicKeyMultibase = await KeyMultibaseCodec.encodeWithType(publicKey, KeyType.ED25519);
      const did = `did:key:${publicKeyMultibase}`;

      const creationRequest: DIDCreationRequest = {
        publicKeyMultibase,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: did,
        controller: did,
      };

      const kit = await IdentityKit.createNewDID('key', creationRequest, signer);
      expect(kit).toBeInstanceOf(IdentityKit);
      expect(kit.getDIDDocument().id).toMatch(/^did:key:/);
    });
  });

  describe('Service Management', () => {
    let kit: IdentityKit;

    beforeEach(async () => {
      kit = await IdentityKit.fromExistingDID(testDID, signer);
    });

    it('should add and remove service', async () => {
      // Debug: Log available keys and their relationships
      const availableKeys = await kit.getAvailableKeyIds();
      console.log('Available keys before adding service:', availableKeys);

      const serviceInfo: ServiceInfo = {
        type: 'MessagingService',
        serviceEndpoint: 'https://example.com/messaging',
        idFragment: 'messaging',
        additionalProperties: {},
      };

      // Add service
      const serviceId = await kit.addService(serviceInfo);
      expect(serviceId).toBe(`${testDID}#messaging`);

      // Verify service was added
      const docAfterAdd = kit.getDIDDocument();
      expect(docAfterAdd.service).toBeDefined();
      expect(docAfterAdd.service!.length).toBe(1);
      expect(docAfterAdd.service![0].id).toBe(serviceId);

      // Remove service
      const removed = await kit.removeService(serviceId);
      expect(removed).toBe(true);

      // Verify service was removed
      const docAfterRemove = kit.getDIDDocument();
      expect(docAfterRemove.service).toBeDefined();
      expect(docAfterRemove.service!.length).toBe(0);
    });
  });

  describe('DID Resolution', () => {
    let kit: IdentityKit;

    beforeEach(async () => {
      // Create DID first
      await keyVDR.create({
        publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: testDID,
        controller: testDID,
      });

      kit = await IdentityKit.fromExistingDID(testDID, signer);
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
      const resolved = await VDRRegistry.getInstance().resolveDID(
        'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
      );
      expect(resolved).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no VDR available for DID method', async () => {
      VDRRegistry.getInstance().registerVDR(keyVDR);
      await expect(VDRRegistry.getInstance().resolveDID('did:example:123')).rejects.toThrow();
    });
  });

  describe('Key Management', () => {
    let kit: IdentityKit;

    beforeEach(async () => {
      kit = await IdentityKit.fromExistingDID(testDID, signer);

      // Debug: Log available keys in signer
      const signerKeys = await signer.listKeyIds();
      console.log('Signer keys:', signerKeys);

      // Debug: Log DID Document
      console.log('DID Document:', JSON.stringify(kit.getDIDDocument(), null, 2));

      // Debug: Log available keys by relationship
      const availableKeys = await kit.getAvailableKeyIds();
      console.log('Available keys by relationship:', availableKeys);
    });

    it('should find key with specific relationship', async () => {
      const availableKeys = await kit.getAvailableKeyIds();
      expect(availableKeys).toBeDefined();
      expect(availableKeys.authentication).toBeDefined();
      expect(availableKeys.authentication!.length).toBeGreaterThan(0);
      expect(availableKeys.authentication).toContain(keyId);
    });

    it('should find key with capabilityInvocation for service management', async () => {
      const availableKeys = await kit.getAvailableKeyIds();
      expect(availableKeys.capabilityInvocation).toBeDefined();
      expect(availableKeys.capabilityInvocation).toContain(keyId);

      const serviceInfo: ServiceInfo = {
        type: 'MessagingService',
        serviceEndpoint: 'https://example.com/messaging',
        idFragment: 'messaging',
        additionalProperties: {},
      };

      const serviceId = await kit.addService(serviceInfo);
      expect(serviceId).toBe(`${testDID}#messaging`);
    });
  });
});
