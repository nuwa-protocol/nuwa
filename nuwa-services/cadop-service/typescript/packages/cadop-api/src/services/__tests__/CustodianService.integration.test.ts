import { beforeAll, describe, expect, it, afterAll, beforeEach } from '@jest/globals';
import { CustodianService } from '../CustodianService.js';
import { RoochClient, Secp256k1Keypair, Ed25519Keypair } from '@roochnetwork/rooch-sdk';
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
  LocalSigner,
} from '@nuwa-ai/identity-kit';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { IdpService } from '../IdpService.js';
import { PublicKeyCredentialJSON } from '@simplewebauthn/types';

// Test configuration
const DEFAULT_NODE_URL = process.env.ROOCH_NODE_URL || 'http://localhost:6767';
const TEST_TIMEOUT = 30000; // 30 seconds

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  // Skip if no ROOCH_NODE_URL is set (for CI/CD environments)
  if (
    !process.env.ROOCH_NODE_URL &&
    (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')
  ) {
    return false;
  }
  return true;
};

// Mock @simplewebauthn/server
jest.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: jest.fn().mockResolvedValue({ verified: true }),
}));

describe('CustodianService Integration Tests', () => {
  let roochClient: RoochClient;
  let cadopServiceKeypair: Secp256k1Keypair;
  let serviceSigner: SignerInterface;
  let cadopServiceDID: string;
  let userId: string;
  let userDID: string;
  let mockPublicKey: Buffer;
  let custodianService: CustodianService;
  let idpService: IdpService;

  beforeAll(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set in CI environment');
      return;
    }

    try {
      // Create a keypair for the service
      cadopServiceKeypair = Secp256k1Keypair.generate();
      const cadopControllerAddress = cadopServiceKeypair.getRoochAddress().toBech32Address();

      // Create and register RoochVDR
      const roochVDR = new RoochVDR({
        rpcUrl: DEFAULT_NODE_URL,
        debug: true,
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);

      const publicKeyBytes = cadopServiceKeypair.getPublicKey().toBytes();
      const publicKeyMultibase = BaseMultibaseCodec.encodeBase58btc(publicKeyBytes);

      const createResult = await roochVDR.create(
        {
          publicKeyMultibase,
          keyType: 'EcdsaSecp256k1VerificationKey2019',
        },
        {
          signer: cadopServiceKeypair,
        }
      );

      console.log('createResult', JSON.stringify(createResult, null, 2));
      expect(createResult.success).toBe(true);
      expect(createResult.didDocument).toBeDefined();
      cadopServiceDID = createResult.didDocument!.id;

      // Create signer adapter
      const localSigner = await LocalSigner.createEmpty(cadopServiceDID);
      localSigner.importRoochKeyPair('account-key', cadopServiceKeypair);
      serviceSigner = localSigner;
      // Initialize CadopIdentityKit
      const cadopKit = await CadopIdentityKit.fromServiceDID(cadopServiceDID, localSigner);

      // Add CADOP service
      const serviceId = await cadopKit.addService({
        idFragment: 'custodian-1',
        type: CadopServiceType.CUSTODIAN,
        serviceEndpoint: 'http://localhost:8080',
        additionalProperties: {
          custodianPublicKey: publicKeyMultibase,
          custodianServiceVMType: 'EcdsaSecp256k1VerificationKey2019',
          description: 'Test Custodian Service',
        },
      });

      expect(serviceId).toBeDefined();
      const custodianServices = cadopKit.findCustodianServices();
      expect(custodianServices).toBeDefined();
      expect(custodianServices.length).toBe(1);
      console.log('custodianServices', JSON.stringify(custodianServices, null, 2));

      const userKeypair = Ed25519Keypair.generate();
      const userPublicKeyBytes = userKeypair.getPublicKey().toBytes();
      userDID = DidKeyCodec.generateDidKey(userPublicKeyBytes, KEY_TYPE.ED25519);

      // Create mock authenticator
      mockPublicKey = crypto.randomBytes(32);

      custodianService = new CustodianService(
        {
          cadopDid: cadopServiceDID,
          maxDailyMints: 10,
        },
        cadopKit
      );

      idpService = new IdpService({
        cadopDid: cadopServiceDID,
        signingKey: 'test-signing-key',
      });

      console.log('Test setup complete:');
      console.log(`- Service address: ${cadopControllerAddress}`);
      console.log(`- Service DID: ${cadopServiceDID}`);
      console.log(`- User DID: ${userDID}`);
    } catch (error) {
      console.error('Failed to setup integration test environment:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {});

  describe('Agent DID Creation', () => {
    it(
      'should create agent DID for a user',
      async () => {
        if (!shouldRunIntegrationTests()) return;

        // Get a valid token
  
        const { nonce } = await idpService.generateChallenge();
        const mockAssertion: PublicKeyCredentialJSON = {
          id: 'credential-id',
          rawId: 'raw-id-base64',
          type: 'public-key',
          response: {
            clientDataJSON: Buffer.from(
              JSON.stringify({
                type: 'webauthn.get',
                challenge: 'invalid-challenge',
                origin: origin,
              })
            ).toString('base64url'),
            authenticatorData: 'auth-data-base64',
            signature: 'signature-base64',
            userHandle: undefined,
          },
          clientExtensionResults: {},
        };
        const { idToken } = await idpService.verifyAssertion(mockAssertion, userDID, nonce, 'localhost', 'http://localhost:3000');

        // Create agent DID
        const result = await custodianService.createAgentDIDViaCADOP({
          idToken: idToken,
          userDid: userDID,
        });

        logger.debug('createAgentDIDViaCADOP result', JSON.stringify(result, null, 2));

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
      },
      TEST_TIMEOUT
    );
  });

  describe('DID Management', () => {
    it(
      'should list agent DIDs for a user',
      async () => {
        if (!shouldRunIntegrationTests()) return;
      },
      TEST_TIMEOUT
    );
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
