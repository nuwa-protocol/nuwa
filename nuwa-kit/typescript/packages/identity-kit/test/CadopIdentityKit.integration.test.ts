import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  NuwaIdentityKit,
  DIDDocument,
  ServiceEndpoint,
  CadopIdentityKit,
  CadopServiceType,
  VDRRegistry,
  KEY_TYPE,
  BaseMultibaseCodec,
} from '../src';
import { RoochVDR } from '../src/vdr/roochVDR';
import { CryptoUtils } from '../src/cryptoUtils';
import { KeyManager } from '../src/keys/KeyManager';
import { DIDStruct, formatDIDString } from '../src/vdr/roochVDRTypes';
import { Secp256k1Keypair } from '@roochnetwork/rooch-sdk';

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

describe('CadopIdentityKit Integration Test', () => {
  let roochVDR: RoochVDR;
  let cadopKit: CadopIdentityKit;
  let cadopPublicKeyMultibase: string;

  beforeEach(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set in CI environment');
      return;
    }
    // Initialize RoochVDR
    roochVDR = new RoochVDR({
      rpcUrl: 'http://localhost:6767',
      debug: true,
    });
    VDRRegistry.getInstance().registerVDR(roochVDR);

    // Generate an external user key pair
    const externalUserKeyPair = Secp256k1Keypair.generate();
    const externalUserAddress = externalUserKeyPair.getRoochAddress().toBech32Address();
    const externalUserDid = `did:rooch:${externalUserAddress}`;

    const publicKeyBytes = externalUserKeyPair.getPublicKey().toBytes();
    //Use the user's public key as the cadop did key
    const publicKeyMultibase = BaseMultibaseCodec.encodeBase58btc(publicKeyBytes);

    const result = await roochVDR.create(
      {
        publicKeyMultibase,
        keyType: 'EcdsaSecp256k1VerificationKey2019',
        controller: externalUserDid,
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ],
      },
      { signer: externalUserKeyPair }
    );

    if (!result.success) {
      throw new Error(
        `Failed to create cadop DID, roochVDR.create result: ${JSON.stringify(result)}`
      );
    }

    let cadopDID = result.didDocument!.id;

    let signer = KeyManager.createEmpty(cadopDID);
    await signer.importRoochKeyPair('account-key', externalUserKeyPair);
    cadopKit = await CadopIdentityKit.fromServiceDID(cadopDID, signer);

    await cadopKit.addService({
      idFragment: 'custodian-1',
      type: CadopServiceType.CUSTODIAN,
      serviceEndpoint: 'https://custodian.example.com',
      additionalProperties: {
        custodianPublicKey: publicKeyMultibase,
        custodianServiceVMType: 'EcdsaSecp256k1VerificationKey2019',
        description: 'Test Custodian Service',
      },
    });

    cadopPublicKeyMultibase = publicKeyMultibase;
  });

  describe('DID Creation', () => {
    it('should create DID via CADOP', async () => {
      if (!shouldRunIntegrationTests()) return;
      let { keyManager: userSigner, keyId, did: userDid } = await KeyManager.createWithDidKey();

      const result = await cadopKit.createDID('rooch', userDid, { description: 'Test DID' });

      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      const doc = result.didDocument!;
      expect(doc.id).toBeDefined();
      expect(doc.controller).toEqual([userDid]);
      expect(doc.authentication).toBeDefined();
      expect(doc.authentication!.length).toBeGreaterThan(0);
      expect(doc.capabilityDelegation).toBeDefined();
      expect(doc.capabilityDelegation!.length).toBeGreaterThan(0);

      // Verify the DID was created in Rooch
      const resolvedDoc = await roochVDR.resolve(doc.id);
      expect(resolvedDoc).toBeDefined();
      expect(resolvedDoc!.id).toBe(doc.id);
    });
  });

  describe('Service Creation', () => {
    it('should create a service', async () => {
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

      await cadopKit.addService({
        idFragment: 'web2proof-1',
        type: CadopServiceType.WEB2_PROOF,
        serviceEndpoint: 'https://web2proof.example.com',
        additionalProperties: {
          supportedPlatforms: ['twitter'],
          description: 'Test Web2 Proof Service',
        },
      });
    });
  });

  describe('Service Discovery', () => {
    it('should find custodian services', () => {
      if (!shouldRunIntegrationTests()) return;
      const services = cadopKit.findCustodianServices();
      expect(services).toHaveLength(1);
      expect(services[0].type).toBe(CadopServiceType.CUSTODIAN);
      expect(services[0].custodianPublicKey).toBe(cadopPublicKeyMultibase);
    });

    // it('should find IdP services', () => {
    //   const services = cadopKit.findIdPServices();
    //   expect(services).toHaveLength(1);
    //   expect(services[0].type).toBe(CadopServiceType.IDP);
    // });

    // it('should find Web2 proof services', () => {
    //   const services = cadopKit.findWeb2ProofServices();
    //   expect(services).toHaveLength(1);
    //   expect(services[0].type).toBe(CadopServiceType.WEB2_PROOF);
    // });
  });
});
