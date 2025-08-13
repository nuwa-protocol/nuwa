import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TestEnv, createCadopCustodian, createDidViaCadop } from '../../src/testHelpers';
import { KeyType } from '../../src/types/crypto';
import { CadopIdentityKit, CadopServiceType } from '../../src/CadopIdentityKit';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('CADOP DID Factory Integration Tests', () => {
  let env: TestEnv;

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
  });

  describe('createCadopCustodian', () => {
    it('should create a custodian DID with CADOP service', async () => {
      if (!shouldRunIntegrationTests()) return;

      const custodian = await createCadopCustodian(env, {
        custodianKeyType: KeyType.SECP256K1,
        skipFunding: false,
      });

      expect(custodian).toBeDefined();
      expect(custodian.did).toBeDefined();
      expect(custodian.did.startsWith('did:rooch:')).toBe(true);
      expect(custodian.signer).toBeDefined();
      expect(custodian.keyManager).toBeDefined();

      // Check that CADOP service was added
      const cadopKit = await CadopIdentityKit.fromServiceDID(custodian.did, custodian.signer);
      const services = cadopKit.findCustodianServices();
      expect(services).toHaveLength(1);
      expect(services[0].type).toBe(CadopServiceType.CUSTODIAN);
      expect(services[0].custodianPublicKey).toBeDefined();
      expect(services[0].custodianServiceVMType).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(services[0].serviceEndpoint).toBe('https://example.com/cadop');

      console.log(`Created custodian DID: ${custodian.did}`);
    });
  });

  describe('createDidViaCadop', () => {
    it('should create a user DID via CADOP using existing custodian', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First create a custodian
      const custodian = await createCadopCustodian(env);

      // Then create user via CADOP
      const user = await createDidViaCadop(env, custodian, {
        userKeyType: KeyType.ED25519,
      });

      expect(user).toBeDefined();
      expect(user.did).toBeDefined();
      expect(user.did.startsWith('did:rooch:')).toBe(true);
      expect(user.did).not.toBe(custodian.did); // Should be different from custodian
      expect(user.signer).toBeDefined();
      expect(user.keyManager).toBeDefined();

      // Check that user's DID document has proper structure
      const userKit = await CadopIdentityKit.fromServiceDID(user.did, user.signer);
      const userDIDDocument = userKit.getNuwaIdentityKit().getDIDDocument();
      expect(userDIDDocument.verificationMethod).toBeDefined();
      expect(userDIDDocument.verificationMethod!.length).toBeGreaterThan(0);
      expect(userDIDDocument.authentication).toBeDefined();

      console.log(`Created user DID via CADOP: ${user.did}`);
      console.log(`Custodian DID: ${custodian.did}`);
    });
  });
});
