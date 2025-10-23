import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  CadopIdentityKit,
  CadopServiceType,
  DebugLogger,
  KeyManager,
  AUTH_PROVIDERS,
} from '../src';
import {
  TestEnv,
  createCadopCustodian,
  createDidViaCadop,
  createSelfDid,
} from '../src/testHelpers';
import { KeyType } from '../src/types/crypto';
import { CryptoUtils } from '../src/crypto';
import { DidKeyCodec, MultibaseCodec } from '../src/multibase';
import { Secp256k1Keypair } from '@roochnetwork/rooch-sdk';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

// Helper function to create a did:key for testing
const createDidKey = async (keyType: KeyType = KeyType.SECP256K1): Promise<string> => {
  const keyPair = await CryptoUtils.generateKeyPair(keyType);
  return DidKeyCodec.generateDidKey(keyPair.publicKey, keyType);
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
      skipFunding: true,
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

  describe('Multi-Wallet CADOP Creation', () => {
    it('should create DID with did:key controller (backward compatibility)', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Create a did:key to act as controller
      const userDidKey = await createDidKey(KeyType.SECP256K1);

      const result = await cadopKit.createDIDWithController('rooch', userDidKey);
      console.log('result', result);
      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument!.id).toMatch(/^did:rooch:/);

      console.log(`Created DID with did:key controller: ${result.didDocument!.id}`);
    });

    it('should create DID with Bitcoin controller', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Generate a proper Bitcoin keypair using rooch-sdk
      const bitcoinKeypair = Secp256k1Keypair.generate();
      const bitcoinAddress = bitcoinKeypair.getBitcoinAddress();
      const bitcoinDid = `did:bitcoin:${bitcoinAddress.toStr()}`;

      // Get the public key and convert to multibase format
      const bitcoinPublicKeyBytes = bitcoinKeypair.getPublicKey().toBytes();
      const bitcoinPublicKey = MultibaseCodec.encodeBase58btc(bitcoinPublicKeyBytes);

      console.log('Generated Bitcoin keypair:');
      console.log('  DID:', bitcoinDid);
      console.log('  Address:', bitcoinAddress.toStr());
      console.log('  Public Key (hex):', Buffer.from(bitcoinPublicKeyBytes).toString('hex'));
      console.log('  Public Key (multibase):', bitcoinPublicKey);

      const result = await cadopKit.createDIDWithController('rooch', bitcoinDid, {
        controllerPublicKeyMultibase: bitcoinPublicKey,
        controllerVMType: 'EcdsaSecp256k1VerificationKey2019',
      });
      console.log('result', result);
      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      expect(result.didDocument!.id).toMatch(/^did:rooch:/);

      console.log(`Created DID with Bitcoin controller: ${result.didDocument!.id}`);
    });

    // Note: did:ethereum support will be added in the future when contract layer supports it

    it('should handle invalid controller DID gracefully', async () => {
      if (!shouldRunIntegrationTests()) return;

      const invalidDid = 'did:invalid:test';
      // Convert hex public key to multibase format (without type prefix)
      const publicKeyHex = '02de3d42a8c1b9f50eb2320fb3142cc0395a6104fa915829bb12342f6b60fbe45e';
      const publicKeyBytes = Buffer.from(publicKeyHex, 'hex');
      const publicKeyMultibase = MultibaseCodec.encodeBase58btc(publicKeyBytes);

      const result = await cadopKit.createDIDWithController('rooch', invalidDid, {
        controllerPublicKeyMultibase: publicKeyMultibase,
        controllerVMType: 'EcdsaSecp256k1VerificationKey2019',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      console.log(`Expected error for invalid DID: ${result.error}`);
    });

    it('should handle missing required parameters for non-did:key controllers', async () => {
      if (!shouldRunIntegrationTests()) return;

      const bitcoinDid = 'did:bitcoin:bc1qx8xkwejc0n64gnc9zllassmy04g2l7759ju7pt';

      // Missing controllerPublicKeyMultibase should cause transaction failure
      const result = await cadopKit.createDIDWithController('rooch', bitcoinDid, {
        // Missing controllerPublicKeyMultibase
        controllerVMType: 'EcdsaSecp256k1VerificationKey2019',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // The error should be a transaction execution failure, not a client-side validation error
      expect(result.error).toMatch(/execution failed|moveabort|transaction.*failed/i);

      console.log(`Expected transaction failure: ${result.error}`);
    });
  });

  describe('Provider Constants', () => {
    it('should have correct AUTH_PROVIDERS constants', () => {
      // This test doesn't require network connection
      expect(AUTH_PROVIDERS.WEBAUTHN).toBe('webauthn');
      expect(AUTH_PROVIDERS.BITCOIN).toBe('bitcoin');
      expect(AUTH_PROVIDERS.ETHEREUM).toBe('ethereum');
    });
  });
});
