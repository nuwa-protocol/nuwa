import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { 
  NuwaIdentityKit,
  DIDDocument,
  ServiceEndpoint,
  CadopIdentityKit,
  CadopServiceType,
  SybilLevel
} from '../src';
import { KeyVDR } from '../src/vdr/keyVDR';
import { CryptoUtils } from '../src/cryptoUtils';
import { KEY_TYPE } from '../src/types';

describe('CadopIdentityKit', () => {
  let keyVDR: KeyVDR;
  let testDID: string;
  let mockDIDDocument: DIDDocument;
  let cadopKit: CadopIdentityKit;
  let baseKit: NuwaIdentityKit;

  const mockCustodianService: ServiceEndpoint = {
    id: 'did:example:123#custodian-1',
    type: CadopServiceType.CUSTODIAN,
    serviceEndpoint: 'https://custodian.example.com',
    custodianPublicKey: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
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
      service: [
        mockCustodianService,
        mockIdPService,
        mockWeb2ProofService
      ]
    };

    // Initialize KeyVDR and reset cache
    keyVDR = new KeyVDR();
    keyVDR.reset();

    // Create DID
    await keyVDR.create({
      publicKeyMultibase: mockDIDDocument.verificationMethod![0].publicKeyMultibase!,
      keyType: 'Ed25519VerificationKey2020',
      preferredDID: testDID,
      controller: testDID
    });

    // Initialize base kit and cadop kit
    baseKit = NuwaIdentityKit.fromDIDDocument(mockDIDDocument);
    baseKit.registerVDR(keyVDR);
    cadopKit = new CadopIdentityKit(baseKit);
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

    it('should discover custodian services from remote DID', async () => {
      // Mock resolveDID to return a DID document with a custodian service
      jest.spyOn(baseKit, 'resolveDID').mockResolvedValue({
        ...mockDIDDocument,
        id: 'did:example:custodian',
        service: [mockCustodianService]
      });

      const services = await cadopKit.discoverCustodianServices('did:example:custodian');
      expect(services).toHaveLength(1);
      expect(services[0]).toEqual(mockCustodianService);
    });

    it('should return empty array when DID resolution fails', async () => {
      jest.spyOn(baseKit, 'resolveDID').mockRejectedValue(new Error('Resolution failed'));
      const services = await cadopKit.discoverCustodianServices('did:example:invalid');
      expect(services).toEqual([]);
    });
  });

  describe('Service Validation', () => {
    it('should validate valid custodian service', () => {
      expect(CadopIdentityKit.validateCustodianService(mockCustodianService)).toBe(true);
    });

    it('should validate valid IdP service', () => {
      expect(CadopIdentityKit.validateIdPService(mockIdPService)).toBe(true);
    });

    it('should validate valid Web2 proof service', () => {
      expect(CadopIdentityKit.validateWeb2ProofService(mockWeb2ProofService)).toBe(true);
    });

    it('should reject custodian service without required properties', () => {
      const invalidService = { ...mockCustodianService };
      delete (invalidService as any).custodianPublicKey;
      expect(CadopIdentityKit.validateCustodianService(invalidService)).toBe(false);
    });

    it('should reject IdP service with invalid supportedCredentials', () => {
      const invalidService = {
        ...mockIdPService,
        supportedCredentials: 'not-an-array'
      };
      expect(CadopIdentityKit.validateIdPService(invalidService)).toBe(false);
    });

    it('should reject service with unknown properties', () => {
      const invalidService = {
        ...mockWeb2ProofService,
        unknownProperty: 'value'
      };
      expect(CadopIdentityKit.validateWeb2ProofService(invalidService)).toBe(false);
    });
  });
}); 