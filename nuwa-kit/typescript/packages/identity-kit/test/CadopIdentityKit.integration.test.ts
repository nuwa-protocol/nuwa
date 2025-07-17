import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { CadopIdentityKit, CadopServiceType, DebugLogger, KeyManager } from '../src';
import { TestEnv, createCadopCustodian, createDidViaCadop } from '../src/testHelpers';
import { KeyType } from '../src/types/crypto';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('CadopIdentityKit Integration Test', () => {
  let env: TestEnv;
  let cadopKit: CadopIdentityKit;
  let custodian: any;

  beforeEach(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set or node not accessible');
      return;
    }

    DebugLogger.setGlobalLevel('debug');

    // Bootstrap test environment
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      debug: true,
    });

    // Create a custodian DID with CADOP service using testHelper
    custodian = await createCadopCustodian(env, {
      custodianKeyType: KeyType.SECP256K1,
      skipFunding: true
    });
    
    // Create CadopIdentityKit from the custodian DID
    cadopKit = await CadopIdentityKit.fromServiceDID(custodian.did, custodian.signer);

    console.log(`Test setup completed:
      Custodian DID: ${custodian.did}
      CADOP service ready, services: ${JSON.stringify(cadopKit.getNuwaIdentityKit().getDIDDocument().service)}`);
  });

  describe('Service Discovery', () => {
    it('should find custodian services', () => {
      if (!shouldRunIntegrationTests()) return;
      
      //console.log('Current services:', cadopKit.getNuwaIdentityKit().getDIDDocument().service);
      const services = cadopKit.findCustodianServices();
      expect(services).toHaveLength(1);
      expect(services[0].type).toBe(CadopServiceType.CUSTODIAN);
      expect(services[0].custodianPublicKey).toBeDefined();
      expect(services[0].custodianServiceVMType).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(services[0].serviceEndpoint).toBe('https://example.com/cadop');

      console.log(`Found custodian service: ${services[0].id}`);
    });

    it('should add and find IdP services', async () => {
      if (!shouldRunIntegrationTests()) return;

      await cadopKit.addService({
        idFragment: 'idp-1',
        type: CadopServiceType.IDP,
        serviceEndpoint: 'https://idp.example.com',
        additionalProperties: {
          supportedCredentials: ['https://example.com/credentials/1'],
          description: 'Test IdP Service',
        },
      });

      const services = cadopKit.findIdPServices();
      expect(services).toHaveLength(1);
      expect(services[0].type).toBe(CadopServiceType.IDP);
      expect(services[0].serviceEndpoint).toBe('https://idp.example.com');
    });

    it('should add and find Web2 proof services', async () => {
      if (!shouldRunIntegrationTests()) return;

      await cadopKit.addService({
        idFragment: 'web2proof-1',
        type: CadopServiceType.WEB2_PROOF,
        serviceEndpoint: 'https://web2proof.example.com',
        additionalProperties: {
          supportedPlatforms: ['twitter', 'google'],
          description: 'Test Web2 Proof Service',
        },
      });

      const services = cadopKit.findWeb2ProofServices();
      expect(services).toHaveLength(1);
      expect(services[0].type).toBe(CadopServiceType.WEB2_PROOF);
      expect(services[0].serviceEndpoint).toBe('https://web2proof.example.com');
    });
  });
});

