import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { 
  NuwaIdentityKit,
  DIDDocument,
  ServiceEndpoint,
  CadopIdentityKit,
  CadopServiceType,
  VDRRegistry
} from '../src';
import { KeyVDR } from '../src/vdr/keyVDR';
import { CryptoUtils } from '../src/cryptoUtils';
import { KEY_TYPE } from '../src/types';

describe('CadopIdentityKit', () => {
  let keyVDR: KeyVDR;
  let testDID: string;
  let mockDIDDocument: DIDDocument;
  let cadopKit: CadopIdentityKit;

  const mockCustodianService: ServiceEndpoint = {
    id: 'did:example:123#custodian-1',
    type: CadopServiceType.CUSTODIAN,
    serviceEndpoint: 'https://custodian.example.com',
    custodianPublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    custodianServiceVMType: 'Ed25519VerificationKey2020',
    description: 'Test Custodian Service',
    fees: {
      registration: 0,
      monthly: 0
    }
  };

  const mockIdPService: ServiceEndpoint = {
    id: 'did:example:123#idp-1',
    type: CadopServiceType.IDP,
    serviceEndpoint: 'https://idp.example.com',
    supportedCredentials: ['EmailCredential', 'PhoneCredential'],
    termsOfService: 'https://idp.example.com/tos',
    description: 'Test IdP Service',
    fees: {
      perCredential: 0
    }
  };

  const mockWeb2ProofService: ServiceEndpoint = {
    id: 'did:example:123#web2proof-1',
    type: CadopServiceType.WEB2_PROOF,
    serviceEndpoint: 'https://proof.example.com',
    supportedPlatforms: ['twitter', 'github'],
    description: 'Test Web2 Proof Service',
    fees: {
      perAttestation: 0
    }
  };

  beforeEach(async () => {
    // Generate a new key pair
    const { publicKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
    testDID = `did:key:${publicKeyMultibase}`;
    const keyId = `${testDID}#account-key`;

    // Create DID Document with CADOP services
    mockDIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
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
      service: [
        mockCustodianService,
        mockIdPService,
        mockWeb2ProofService
      ]
    };

    // Initialize KeyVDR and reset cache
    keyVDR = new KeyVDR();
    keyVDR.reset();

    // Register VDR
    VDRRegistry.getInstance().registerVDR(keyVDR);

    // Create DID with services
    await keyVDR.create({
      publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
      keyType: 'Ed25519VerificationKey2020',
      preferredDID: testDID,
      controller: testDID,
      initialServices: mockDIDDocument.service,
      initialRelationships: ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation']
    });

    // Initialize cadop kit
    cadopKit = await CadopIdentityKit.fromServiceDID(testDID);
  });

  describe('Initialization', () => {
    it('should initialize from service DID', async () => {
      const kit = await CadopIdentityKit.fromServiceDID(testDID);
      expect(kit).toBeInstanceOf(CadopIdentityKit);
      expect(kit.getNuwaIdentityKit().getDIDDocument()).toEqual(mockDIDDocument);
    });

    it('should fail to initialize with invalid service DID', async () => {
      await expect(CadopIdentityKit.fromServiceDID('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'))
        .rejects.toThrow();
    });
  });

  describe('Service Management', () => {
    it('should add CADOP service', async () => {
      const serviceInfo = {
        idFragment: 'custodian-2',
        type: CadopServiceType.CUSTODIAN,
        serviceEndpoint: 'https://custodian2.example.com',
        additionalProperties: {
          custodianPublicKey: 'test-key',
          custodianServiceVMType: 'Ed25519VerificationKey2020',
          description: 'Another custodian service'
        }
      };

      const serviceId = await cadopKit.addService(serviceInfo, {
        keyId: `${testDID}#account-key`
      });

      expect(serviceId).toBe(`${testDID}#custodian-2`);
      
      // Verify the service was added
      const doc = await keyVDR.resolve(testDID);
      expect(doc).not.toBeNull();
      expect(doc!.service).toHaveLength(4); // Original 3 + new one
      expect(doc!.service?.find(s => s.id === serviceId)).toBeTruthy();
    });

    it('should fail to add invalid CADOP service', async () => {
      const serviceInfo = {
        idFragment: 'custodian-2',
        type: CadopServiceType.CUSTODIAN,
        serviceEndpoint: 'https://custodian2.example.com',
        additionalProperties: {
          // Missing required custodianPublicKey and custodianServiceVMType
          description: 'Invalid custodian service'
        }
      };

      await expect(cadopKit.addService(serviceInfo, {
        keyId: `${testDID}#account-key`
      })).rejects.toThrow('Invalid CADOP service configuration');
    });
  });

  describe('DID Creation', () => {
    it('should create DID via CADOP', async () => {
      // Generate a new key for the user
      const { publicKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
      const userDid = `did:key:${publicKeyMultibase}`;

      const result = await cadopKit.createDID(
        'key',
        userDid,
        { description: 'Test DID' }
      );

      expect(result.success).toBe(true);
      expect(result.didDocument).toBeDefined();
      const doc = result.didDocument!;
      expect(doc.id).toBeDefined();
      expect(doc.id).toMatch(/^did:key:/);
      expect(doc.controller).toEqual([userDid]);
      expect(doc.authentication).toBeDefined();
      expect(doc.authentication!.length).toBeGreaterThan(0);
      expect(doc.capabilityDelegation).toBeDefined();
      expect(doc.capabilityDelegation!.length).toBeGreaterThan(0);
    });

    it('should fail to create DID without custodian service', async () => {
      // Create a new DID without services
      const { publicKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
      const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
      const didWithoutServices = `did:key:${publicKeyMultibase}`;

      await keyVDR.create({
        publicKeyMultibase,
        keyType: 'Ed25519VerificationKey2020',
        preferredDID: didWithoutServices,
        controller: didWithoutServices
      });

      const kitWithoutCustodian = await CadopIdentityKit.fromServiceDID(didWithoutServices);

      await expect(kitWithoutCustodian.createDID('key', 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'))
        .rejects.toThrow('Custodian service configuration not found');
    });
  });

  describe('Service Discovery', () => {
    it('should find custodian services', () => {
      const services = cadopKit.findCustodianServices();
      expect(services).toHaveLength(1);
      expect(services[0]).toEqual(mockCustodianService);
    });

    it('should find IdP services', () => {
      const services = cadopKit.findIdPServices();
      expect(services).toHaveLength(1);
      expect(services[0]).toEqual(mockIdPService);
    });

    it('should find Web2 proof services', () => {
      const services = cadopKit.findWeb2ProofServices();
      expect(services).toHaveLength(1);
      expect(services[0]).toEqual(mockWeb2ProofService);
    });
  });
}); 