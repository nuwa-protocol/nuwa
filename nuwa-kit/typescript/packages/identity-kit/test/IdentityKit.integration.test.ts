import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { IdentityKit } from '../src/IdentityKit';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '../src/testHelpers';
import { KeyType } from '../src/types/crypto';
import { ServiceInfo } from '../src/types/did';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('IdentityKit Integration Test', () => {
  let env: TestEnv;
  let testDid: CreateSelfDidResult;

  beforeEach(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set or node not accessible');
      return;
    }

    // Bootstrap test environment
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'test',
      debug: true,
    });

    // Create a test DID using test helper
    testDid = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    console.log(`Test setup completed:
      Test DID: ${testDid.did}
      Test VM ID Fragment: ${testDid.vmIdFragment}`);
  });

  describe('Basic DID Operations', () => {
    it('should load existing DID and get DID document', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Load the DID using IdentityKit
      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      // Get DID document
      const didDocument = kit.getDIDDocument();

      expect(didDocument).toBeDefined();
      expect(didDocument.id).toBe(testDid.did);
      expect(didDocument.verificationMethod).toBeDefined();
      expect(didDocument.verificationMethod!.length).toBeGreaterThan(0);
      expect(didDocument.authentication).toBeDefined();
      expect(didDocument.authentication!.length).toBeGreaterThan(0);
    });

    it('should get available key IDs', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      const availableKeys = await kit.getAvailableKeyIds();

      expect(availableKeys).toBeDefined();
      expect(availableKeys.authentication).toBeDefined();
      expect(availableKeys.authentication!.length).toBeGreaterThan(0);

      console.log('Available key relationships:', Object.keys(availableKeys));
    });

    it('should check if can sign with key', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      const availableKeys = await kit.getAvailableKeyIds();
      const authKeyId = availableKeys.authentication?.[0];

      expect(authKeyId).toBeDefined();

      const canSign = await kit.canSignWithKey(authKeyId!);
      expect(canSign).toBe(true);
    });

    it('should find verification methods by relationship', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      const authMethods = kit.findVerificationMethodsByRelationship('authentication');

      expect(authMethods).toBeDefined();
      expect(authMethods.length).toBeGreaterThan(0);
      expect(authMethods[0].type).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(authMethods[0].publicKeyMultibase).toBeDefined();
    });
  });

  describe('Verification Method Management', () => {
    it('should add a new verification method', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      // Generate a new key pair for the verification method
      const newKeyPair = await testDid.keyManager.generateKey('test-key', KeyType.ED25519);

      // Get the public key bytes from the multibase encoded key
      const { MultibaseCodec } = await import('../src/multibase');
      const publicKeyBytes = MultibaseCodec.decodeBase58btc(newKeyPair.publicKeyMultibase);

      // Add verification method
      const newKeyId = await kit.addVerificationMethod(
        {
          type: 'Ed25519VerificationKey2020',
          publicKeyMaterial: publicKeyBytes,
          idFragment: 'test-key',
        },
        ['authentication', 'assertionMethod']
      );

      expect(newKeyId).toBeDefined();
      expect(newKeyId).toContain('#test-key');

      // Verify the key was added
      const updatedDoc = kit.getDIDDocument();
      const newVerificationMethod = updatedDoc.verificationMethod?.find(vm => vm.id === newKeyId);
      expect(newVerificationMethod).toBeDefined();
      expect(newVerificationMethod!.type).toBe('Ed25519VerificationKey2020');

      console.log(`Added new verification method: ${newKeyId}`);
    });
  });

  describe('Service Management', () => {
    it('should add a service to DID document', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      const serviceInfo: ServiceInfo = {
        idFragment: 'test-service',
        type: 'TestService',
        serviceEndpoint: 'https://example.com/test-service',
        additionalProperties: {
          description: 'A test service for integration testing',
        },
      };

      const serviceId = await kit.addService(serviceInfo);

      expect(serviceId).toBeDefined();
      expect(serviceId).toContain('#test-service');

      // Verify the service was added
      const updatedDoc = kit.getDIDDocument();
      const addedService = updatedDoc.service?.find(s => s.id === serviceId);
      expect(addedService).toBeDefined();
      expect(addedService!.type).toBe('TestService');
      expect(addedService!.serviceEndpoint).toBe('https://example.com/test-service');
      expect(addedService!.description).toBe('A test service for integration testing');

      console.log(`Added service: ${serviceId}`);
    });

    it('should find service by type', async () => {
      if (!shouldRunIntegrationTests()) return;

      const kit = await IdentityKit.fromExistingDID(testDid.did, testDid.signer);

      // First add a service
      const serviceInfo: ServiceInfo = {
        idFragment: 'findable-service',
        type: 'FindableService',
        serviceEndpoint: 'https://example.com/findable',
      };

      await kit.addService(serviceInfo);

      // Now find it
      const foundService = kit.findServiceByType('FindableService');

      expect(foundService).toBeDefined();
      expect(foundService!.type).toBe('FindableService');
      expect(foundService!.serviceEndpoint).toBe('https://example.com/findable');
    });
  });

  describe('Bootstrap and Environment', () => {
    it('should bootstrap IdentityKit environment', async () => {
      if (!shouldRunIntegrationTests()) return;

      const bootstrapEnv = await IdentityKit.bootstrap({
        method: 'rooch',
        vdrOptions: {
          rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
          network: 'test',
        },
      });

      expect(bootstrapEnv).toBeDefined();
      expect(bootstrapEnv.registry).toBeDefined();
      expect(bootstrapEnv.keyManager).toBeDefined();

      // Test loading our existing DID through the bootstrapped environment
      const kit = await bootstrapEnv.loadDid(testDid.did, testDid.signer);
      const didDoc = kit.getDIDDocument();

      expect(didDoc.id).toBe(testDid.did);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid DID', async () => {
      if (!shouldRunIntegrationTests()) return;

      const invalidDid = 'did:rooch:0xinvalidaddress';

      await expect(IdentityKit.fromExistingDID(invalidDid, testDid.signer)).rejects.toThrow();
    });

    it('should throw error when no VDR available for method', async () => {
      if (!shouldRunIntegrationTests()) return;

      const unsupportedDid = 'did:unsupported:test';

      await expect(IdentityKit.fromExistingDID(unsupportedDid, testDid.signer)).rejects.toThrow(
        "No VDR available for DID method 'unsupported'"
      );
    });
  });
});
