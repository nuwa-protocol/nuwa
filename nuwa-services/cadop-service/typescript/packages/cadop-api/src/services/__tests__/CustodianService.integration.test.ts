import { beforeAll, describe, expect, it, afterAll } from '@jest/globals';
import { CustodianService, createCustodianService } from '../CustodianService.js';
import roochSdk from '@roochnetwork/rooch-sdk';
import type { RoochClient as RoochClientType, Secp256k1Keypair as Secp256k1KeypairType, Ed25519Keypair as Ed25519KeypairType } from '@roochnetwork/rooch-sdk';
const { RoochClient, Secp256k1Keypair, Ed25519Keypair } = roochSdk;
import {
  VDRRegistry,
  RoochVDR,
  CadopIdentityKit,
  CadopServiceType,
  KEY_TYPE,
  CryptoUtils,
  SignerInterface,
  BaseMultibaseCodec,
  DidKeyCodec,
  DIDAccount
} from 'nuwa-identity-kit';
import { WebAuthnService } from '../WebAuthnService.js';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

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

describe('CustodianService Integration Tests', () => {
  let roochClient: RoochClientType;
  let serviceKeypair: Secp256k1KeypairType;
  let serviceSigner: SignerInterface;
  let serviceDID: string;
  let custodianService: CustodianService;
  let cadopKit: CadopIdentityKit;
  let userId: string;
  let userDID: string;
  let mockPublicKey: Buffer;
  let webauthnService: WebAuthnService;

  beforeAll(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set in CI environment');
      return;
    }

    try {
      // Create a keypair for the service
      serviceKeypair = Secp256k1Keypair.generate();
      const serviceAddress = serviceKeypair.getRoochAddress().toBech32Address();

      // Create Rooch client
      roochClient = new RoochClient({ url: DEFAULT_NODE_URL });
      
      // Create and register RoochVDR
      const roochVDR = new RoochVDR({
        rpcUrl: DEFAULT_NODE_URL,
        client: roochClient,
        signer: serviceKeypair,
        debug: true
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);

      const publicKeyBytes = serviceKeypair.getPublicKey().toBytes();
      const publicKeyMultibase = BaseMultibaseCodec.encodeBase58btc(publicKeyBytes);
      
      const createResult = await roochVDR.create({
        publicKeyMultibase,
        keyType: 'EcdsaSecp256k1VerificationKey2019',
      });

      console.log('createResult', JSON.stringify(createResult, null, 2))
      expect(createResult.success).toBe(true);
      expect(createResult.didDocument).toBeDefined();
      serviceDID = createResult.didDocument!.id;

      // Create signer adapter
      serviceSigner = new DIDAccount(serviceDID, serviceKeypair);

      // Initialize CadopIdentityKit
      cadopKit = await CadopIdentityKit.fromServiceDID(serviceDID, {
        externalSigner: serviceSigner
      });

      // Add CADOP service
      const serviceId = await cadopKit.addService({
        idFragment: 'custodian-1',
        type: CadopServiceType.CUSTODIAN,
        serviceEndpoint: 'http://localhost:8080',
        additionalProperties: {
          custodianPublicKey: publicKeyMultibase,
          custodianServiceVMType: 'EcdsaSecp256k1VerificationKey2019',
          description: 'Test Custodian Service'
        }
      }, {
        keyId: `${serviceDID}#account-key`
      });

      expect(serviceId).toBeDefined();
      const custodianServices = cadopKit.findCustodianServices();
      expect(custodianServices).toBeDefined();
      expect(custodianServices.length).toBe(1);
      console.log('custodianServices', JSON.stringify(custodianServices, null, 2))
      
      webauthnService = new WebAuthnService({
        rpName: 'CADOP Service',
        rpID: 'localhost',
        origin: 'http://localhost:3000',
        timeout: 30000,
        attestationType: 'none',
        serviceDid: serviceDID,
        signingKey: 'test-signing-key'
      });

      // Initialize CustodianService
      custodianService = await createCustodianService({
        custodianDid: serviceDID,
        maxDailyMints: 100,
        rpcUrl: DEFAULT_NODE_URL,
      }, webauthnService);
      // Create a test user and authenticator using WebAuthnService
      const userKeypair = Ed25519Keypair.generate();
      const userPublicKeyBytes = userKeypair.getPublicKey().toBytes();
      userDID = DidKeyCodec.generateDidKey(userPublicKeyBytes, KEY_TYPE.ED25519);
      const user = await webauthnService['userRepo'].create({
        user_did: userDID,
        display_name: 'Test User'
      });
      userId = user.id;

      // Create mock authenticator
      mockPublicKey = crypto.randomBytes(32);
      await webauthnService['authenticatorRepo'].create({
        user_id: userId,
        credential_id: crypto.randomBytes(32).toString('base64url'),
        credential_public_key: mockPublicKey.toString('hex'),
        counter: 0,
        credential_device_type: 'platform',
        credential_backed_up: true,
        transports: ['internal'],
        friendly_name: 'Test Device'
      });

      console.log('Test setup complete:');
      console.log(`- Service address: ${serviceAddress}`);
      console.log(`- Service DID: ${serviceDID}`);
      console.log(`- User DID: ${userDID}`);
      console.log(`- User ID: ${userId}`);

    } catch (error) {
      console.error('Failed to setup integration test environment:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (roochClient && roochClient.destroy) {
      roochClient.destroy();
    }
    // Cleanup test user and authenticator
    if (userId) {
      await webauthnService['authenticatorRepo'].deleteByUserId(userId);
      await webauthnService['userRepo'].delete(userId);
    }
  });

  describe('Agent DID Creation', () => {
    it('should create agent DID for a user', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Get a valid token
      const { id_token } = await webauthnService.getIdToken(userId);

      // Create agent DID
      const result = await custodianService.createAgentDIDViaCADOP({
        idToken: id_token,
        userDid: userDID
      });

      logger.debug('createAgentDIDViaCADOP result', JSON.stringify(result, null, 2))

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.agentDid).toBeDefined();
      expect(result.userDid).toBe(userDID);

      // Verify the agent DID exists
      const exists = await VDRRegistry.getInstance().exists(result.agentDid!);
      expect(exists).toBe(true);

      // Resolve and verify the agent DID
      const agentDoc = await VDRRegistry.getInstance().resolveDID(result.agentDid!);
      expect(agentDoc).toBeDefined();
      expect(agentDoc!.controller).toContain(userDID);

      console.log('Agent DID creation successful:');
      console.log(`- User DID: ${userDID}`);
      console.log(`- Agent DID: ${result.agentDid}`);
    }, TEST_TIMEOUT);
  });

  describe('DID Management', () => {
    it('should list agent DIDs for a user', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Get a valid token
      const { id_token } = await webauthnService.getIdToken(userId);

      // Create an agent DID
      const createResult = await custodianService.createAgentDIDViaCADOP({
        idToken: id_token,
        userDid: userDID
      });

      // List agent DIDs
      const agentDIDs = await custodianService.getUserAgentDIDs(userDID);
      expect(agentDIDs).toContain(createResult.agentDid);
    }, TEST_TIMEOUT);
  });
});

// Skip integration tests in CI unless explicitly enabled
if (process.env.CI === 'true' && !process.env.RUN_INTEGRATION_TESTS) {
  describe.skip('CustodianService Integration Tests', () => {
    it('skipped in CI environment', () => {
      console.log('Integration tests skipped in CI. Set RUN_INTEGRATION_TESTS=true to enable.');
    });
  });
} 