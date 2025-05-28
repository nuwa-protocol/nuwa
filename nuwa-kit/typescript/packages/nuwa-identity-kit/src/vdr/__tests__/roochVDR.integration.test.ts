import { beforeAll, describe, expect, it, afterAll } from '@jest/globals';
import { DIDAccount, RoochVDR } from '../roochVDR';
import { VerificationMethod } from '../../types';

// Import Rooch SDK components for integration testing
import { 
  RoochClient, 
  Secp256k1Keypair, 
  Transaction, 
  Args, 
  getRoochNodeUrl, 
  RoochAddress
} from '@roochnetwork/rooch-sdk';

// Test configuration
const DEFAULT_NODE_URL = process.env.ROOCH_NODE_URL || 'http://localhost:6767';
const TEST_TIMEOUT = 30000; // 30 seconds

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  // Skip if no ROOCH_NODE_URL is set (for CI/CD environments)
  if (!process.env.ROOCH_NODE_URL && (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')) {
    return false;
  }
  return true;
};

describe('RoochVDR Integration Tests', () => {
  let roochVDR: RoochVDR;
  let client: any;
  let keypair: any;
  let testAddress: string;
  let actualDIDAddress: string;

  beforeAll(async () => {
    // Skip integration tests if should not run
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set in CI environment');
      return;
    }

    try {
      // Create a test keypair
      keypair = Secp256k1Keypair.generate();
      testAddress = keypair.getRoochAddress().toHexAddress();

      // Create Rooch client
      client = new RoochClient({ url: DEFAULT_NODE_URL });

      // Create RoochVDR instance
      roochVDR = new RoochVDR({
        rpcUrl: DEFAULT_NODE_URL,
        client: client,
        signer: keypair,
        didContractAddress: '0x3::did'
      });

      console.log(`Test address: ${testAddress}`);
    } catch (error) {
      console.error('Failed to setup integration test environment:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (client && client.destroy) {
      client.destroy();
    }
  });

  describe('Basic DID Operations', () => {
    it('should check if DID contract is available', async () => {
      if (!shouldRunIntegrationTests()) return;

      try {
        // Try to call a simple view function to check if the contract exists
        const result = await client.executeViewFunction({
          target: '0x3::did::verification_relationship_authentication',
          args: []
        });
        console.log('DID contract is available, authentication constant:', result);
      } catch (error) {
        console.warn('DID contract may not be deployed:', error);
        // Skip the rest of the tests if contract is not available
        return;
      }
    }, TEST_TIMEOUT);

    it('should check if DID exists (initially false)', async () => {
      if (!shouldRunIntegrationTests()) return;

      const testDid = `did:rooch:${testAddress}`;
      const exists = await roochVDR.exists(testDid);
      expect(exists).toBe(false);
    }, TEST_TIMEOUT);

    it('should create a DID document for self', async () => {
      if (!shouldRunIntegrationTests()) return;

      const testDid = `did:rooch:${testAddress}`;
      
      // Get the actual public key from the keypair (Secp256k1)
      const publicKeyBytes = keypair.getPublicKey().toBytes();
      
      // Create correct multibase encoding for Secp256k1 public key
      const multibase = require('multibase');
      const encoded = multibase.encode('base58btc', publicKeyBytes);
      const publicKeyMultibase = new TextDecoder().decode(encoded);
      
      console.log('Using public key multibase (raw):', publicKeyMultibase);
      console.log('Should start with z (base58btc):', publicKeyMultibase.startsWith('z'));
      console.log('Public key bytes length:', publicKeyBytes.length);
      console.log('First few bytes:', Array.from(publicKeyBytes.slice(0, 5) as Uint8Array).map((b: number) => '0x' + b.toString(16).padStart(2, '0')));
      
      // Create a new DID using create method
      const result = await roochVDR.create({
        publicKeyMultibase,
        keyType: 'EcdsaSecp256k1VerificationKey2019',
        preferredDID: testDid,
        controller: testDid
      }, { signer: keypair });

      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument!.id).toBeTruthy();

      // Get the actual DID address from the create operation
      actualDIDAddress = result.didDocument!.id;
      expect(actualDIDAddress).toBeTruthy();
      expect(actualDIDAddress).toMatch(/^did:rooch:rooch1[a-z0-9]+$/);
      
      console.log('✅ Actual DID created:', actualDIDAddress);
      console.log('📝 Controller address:', testAddress);
      console.log('Note: External keypair is controller, DID contract creates new account for actual DID');
    }, TEST_TIMEOUT);

    it('should check if DID exists (now true)', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Use the actual DID address that was created
      expect(actualDIDAddress).toBeTruthy();
      const exists = await roochVDR.exists(actualDIDAddress);
      expect(exists).toBe(true);
    }, TEST_TIMEOUT);

    it('should resolve the created DID document', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Use the actual DID address that was created
      expect(actualDIDAddress).toBeTruthy();
      const resolvedDoc = await roochVDR.resolve(actualDIDAddress);
      expect(resolvedDoc).toBeTruthy();
      expect(resolvedDoc?.id).toBe(actualDIDAddress);
      // The controller should be properly set (could be the DID itself or the creator address)
      expect(resolvedDoc?.controller).toBeTruthy();
      expect(Array.isArray(resolvedDoc?.controller)).toBe(true);
      expect((resolvedDoc?.controller as string[]).length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  describe('Verification Method Management', () => {
    it('should add a new verification method', async () => {
      if (!shouldRunIntegrationTests()) return;

      expect(actualDIDAddress).toBeTruthy();
      
      console.log(`🔧 Adding verification method to DID: ${actualDIDAddress}`);
      console.log(`🗝️ Using signer with address: ${testAddress}`);
      
      const newKeypair = Secp256k1Keypair.generate();
      const publicKeyBytes = newKeypair.getPublicKey().toBytes();
      
      const multibase = require('multibase');
      const encoded = multibase.encode('base58btc', publicKeyBytes);
      const publicKeyMultibase = new TextDecoder().decode(encoded);
      
      console.log('Generated new verification method:');
      console.log('- Public key multibase:', publicKeyMultibase);
      console.log('- Should start with z (base58btc):', publicKeyMultibase.startsWith('z'));
      console.log('- Public key bytes length:', publicKeyBytes.length);
      console.log('- First few bytes:', Array.from(publicKeyBytes.slice(0, 5) as Uint8Array).map((b: number) => '0x' + b.toString(16).padStart(2, '0')));
      
      const verificationMethod: VerificationMethod = {
        id: `${actualDIDAddress}#key-2`,
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: actualDIDAddress,
        publicKeyMultibase: publicKeyMultibase,
      };

      let didAccount = new DIDAccount(actualDIDAddress, keypair);

      const success = await roochVDR.addVerificationMethod(
        actualDIDAddress,
        verificationMethod,
        ['authentication', 'assertionMethod'],
        { signer: didAccount }
      );

      console.log(`📝 Add verification method result: ${success}`);
      expect(success).toBe(true);
      console.log(`✅ Test passed: Successfully added verification method using DID account signer`);
    }, TEST_TIMEOUT);

    it('should remove a verification method', async () => {
      if (!shouldRunIntegrationTests()) return;

      expect(actualDIDAddress).toBeTruthy();
      
      console.log(`🗑️ Attempting to remove verification method from DID: ${actualDIDAddress}`);
      
      let didAccount = new DIDAccount(actualDIDAddress, keypair);
      
      const success = await roochVDR.removeVerificationMethod(
        actualDIDAddress,
        `${actualDIDAddress}#key-2`,
        { signer: didAccount }
      );

      console.log(`📝 Remove verification method result: ${success}`);
      expect(success).toBe(true);
      console.log(`✅ Test passed: Successfully removed verification method using DID account signer`);
    }, TEST_TIMEOUT);
  });

  describe('Service Management', () => {
    it('should add a service endpoint', async () => {
      if (!shouldRunIntegrationTests()) return;

      expect(actualDIDAddress).toBeTruthy();
      
      console.log(`🔧 Adding service to DID: ${actualDIDAddress}`);
      console.log(`🗝️ Using signer with address: ${testAddress}`);
      
      let didAccount = new DIDAccount(actualDIDAddress, keypair);
      
      const success = await roochVDR.addService(
        actualDIDAddress,
        {
          id: `${actualDIDAddress}#service-1`,
          type: 'LinkedDomains',
          serviceEndpoint: 'https://example.com',
        },
        { signer: didAccount }
      );

      console.log(`📝 Add service result: ${success}`);
      expect(success).toBe(true);
      console.log(`✅ Test passed: Successfully added service using DID account signer`);
    }, TEST_TIMEOUT);

    it('should add a service with properties', async () => {
      if (!shouldRunIntegrationTests()) return;

      expect(actualDIDAddress).toBeTruthy();
      
      console.log(`🔧 Adding service with properties to DID: ${actualDIDAddress}`);
      
      let didAccount = new DIDAccount(actualDIDAddress, keypair);
      
      const success = await roochVDR.addServiceWithProperties(
        actualDIDAddress,
        {
          id: `${actualDIDAddress}#llm-service`,
          type: 'LLMGatewayNIP9',
          serviceEndpoint: 'https://api.example.com/llm',
          properties: {
            'model': 'gpt-4',
            'version': '1.0',
          }
        },
        { signer: didAccount }
      );

      console.log(`📝 Add service with properties result: ${success}`);
      expect(success).toBe(true);
      console.log(`✅ Test passed: Successfully added service with properties using DID account signer`);
    }, TEST_TIMEOUT);

    it('should remove a service', async () => {
      if (!shouldRunIntegrationTests()) return;

      expect(actualDIDAddress).toBeTruthy();
      
      console.log(`🗑️ Attempting to remove service from DID: ${actualDIDAddress}`);
      
      let didAccount = new DIDAccount(actualDIDAddress, keypair);
      
      const success = await roochVDR.removeService(
        actualDIDAddress,
        `${actualDIDAddress}#service-1`,
        { signer: didAccount }
      );

      console.log(`📝 Remove service result: ${success}`);
      expect(success).toBe(true);
      console.log(`✅ Test passed: Successfully removed service using DID account signer`);
    }, TEST_TIMEOUT);
  });

  describe('CADOP Operations', () => {
    it('should create DID via CADOP', async () => {
      if (!shouldRunIntegrationTests()) return;

      console.log('🏗️ Testing CADOP DID creation...');
      console.log(`📝 Custodian address: ${testAddress}`);
      console.log(`📝 Actual DID created earlier: ${actualDIDAddress}`);
      
      // First, try to add a CADOP service to the custodian's actual DID
      // Note: The custodian would need to have their own DID to provide CADOP services
      // For this test, we'll try to add the service to the actual DID created earlier
      
      console.log(`🔧 Attempting to add CADOP service to actual DID: ${actualDIDAddress}`);
      
      let didAccount = new DIDAccount(actualDIDAddress, keypair);
      
      const serviceAddResult = await roochVDR.addServiceWithProperties(
        actualDIDAddress,
        {
          id: `${actualDIDAddress}#cadop-service`,
          type: 'CadopCustodianService',
          serviceEndpoint: 'https://custodian.example.com/api/cadop',
          properties: {
            'name': 'Test Custodian',
            'maxDailyMints': '1000'
          }
        },
        { signer: didAccount }
      );

      console.log(`📝 CADOP service addition result: ${serviceAddResult}`);
      expect(serviceAddResult).toBe(true);
      console.log(`✅ Successfully added CADOP service using DID account signer`);

      // Now try to create a DID via CADOP
      console.log('🚀 Attempting CADOP DID creation...');
      
      const cadopRequest = {
        userDidKey: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        custodianServicePublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        custodianServiceVMType: 'Ed25519VerificationKey2020'
      };
      
      const result = await roochVDR.createViaCADOP(
        cadopRequest,
        { signer: didAccount }
      );

      console.log(`📝 CADOP DID creation result: ${result.success}`);
      expect(result.success).toBe(true);
      console.log(`✅ Successfully created DID via CADOP using DID account signer`);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle non-existent DID resolution gracefully', async () => {
      if (!shouldRunIntegrationTests()) return;

      const nonExistentDid = 'did:rooch:0x999999999999999999999999999999999999999999999999999999999999999';
      const result = await roochVDR.resolve(nonExistentDid);
      expect(result).toBeNull();
    }, TEST_TIMEOUT);

    it('should handle invalid DID format gracefully', async () => {
      if (!shouldRunIntegrationTests()) return;

      const invalidDid = 'invalid:did:format';
      const exists = await roochVDR.exists(invalidDid);
      expect(exists).toBe(false);
    }, TEST_TIMEOUT);

  });
});

// Helper function to check if we're in a CI environment
function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

// Skip integration tests in CI unless explicitly enabled
if (isCI() && !process.env.RUN_INTEGRATION_TESTS) {
  describe.skip('RoochVDR Integration Tests', () => {
    it('skipped in CI environment', () => {
      console.log('Integration tests skipped in CI. Set RUN_INTEGRATION_TESTS=true to enable.');
    });
  });
} 