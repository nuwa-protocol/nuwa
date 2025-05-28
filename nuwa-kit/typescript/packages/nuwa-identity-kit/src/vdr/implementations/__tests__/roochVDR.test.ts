import { RoochVDR } from '../roochVDR';
import { DIDDocument, VerificationMethod } from '../../../types';

// Mock the Rooch SDK
jest.mock('@roochnetwork/rooch-sdk', () => {
  class MockSigner {
    getRoochAddress() { return new MockRoochAddress('0x123'); }
    sign() { return Promise.resolve(new Uint8Array()); }
    signTransaction() { return Promise.resolve({}); }
    getKeyScheme() { return 'Ed25519'; }
    getPublicKey() { return new MockPublicKey(); }
    getBitcoinAddress() { throw new Error('Not implemented'); }
  }

  class MockRoochAddress {
    private address: string;
    constructor(address: string) {
      this.address = address;
    }
    toBech32Address() { return 'rooch1...'; }
    toHexAddress() { return this.address; }
  }

  class MockKeypair {
    sign() { return Promise.resolve(new Uint8Array()); }
    getKeyScheme() { return 'Ed25519'; }
    getPublicKey() { return new MockPublicKey(); }
  }

  class MockPublicKey {
    toBytes() { return new Uint8Array(); }
  }

  class MockAddress {
    toBytes() { return new Uint8Array(); }
  }

  class MockBitcoinAddress {
    toBytes() { return new Uint8Array(); }
  }

  return {
    Signer: MockSigner,
    RoochAddress: MockRoochAddress,
    Keypair: MockKeypair,
    PublicKey: MockPublicKey,
    Address: MockAddress,
    BitcoinAddress: MockBitcoinAddress,
    RoochClient: jest.fn().mockImplementation(() => ({
      executeViewFunction: jest.fn(),
      signAndExecuteTransaction: jest.fn(),
      getStates: jest.fn(),
    })),
    Transaction: jest.fn().mockImplementation(() => ({
      callFunction: jest.fn(),
    })),
    Args: {
      string: jest.fn((val) => ({ value: val, type: 'string' })),
      address: jest.fn((val) => ({ value: val, type: 'address' })),
      u8: jest.fn((val) => ({ value: val, type: 'u8' })),
      vec: jest.fn((type, val) => ({ value: val, type: `vec<${type}>` })),
    },
    getRoochNodeUrl: jest.fn((network) => {
      const networkMap: { [key: string]: string } = {
        'dev': 'localnet',
        'test': 'testnet', 
        'main': 'mainnet'
      };
      const roochNetwork = networkMap[network] || network;
      return `https://${roochNetwork}-seed.rooch.network/`;
    }),
    bcs: {
      struct: jest.fn(() => ({
        parse: jest.fn(),
      })),
      string: jest.fn(),
      vector: jest.fn(),
      ObjectId: 'ObjectId',
      Address: 'Address',
    },
    address: 'address',
  };
});

describe('RoochVDR', () => {
  let roochVDR: RoochVDR;
  let mockClient: any;
  let mockSigner: any;

  beforeEach(() => {
    mockClient = {
      executeViewFunction: jest.fn(),
      signAndExecuteTransaction: jest.fn(),
      getStates: jest.fn(),
    };

    mockSigner = {
      getRoochAddress: jest.fn(() => ({
        toBech32Address: () => 'rooch1test',
        toHexAddress: () => '0x123'
      })),
      signTransaction: jest.fn(),
    };

    roochVDR = new RoochVDR({
      rpcUrl: 'https://test-seed.rooch.network/',
      client: mockClient,
      signer: mockSigner,
    });
  });

  describe('createDefault', () => {
    it('should create a RoochVDR instance with default configuration', () => {
      const vdr = RoochVDR.createDefault('test');
      expect(vdr).toBeInstanceOf(RoochVDR);
    });
  });

  describe('exists', () => {
    it('should return true when DID exists', async () => {
      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ decoded_value: true }],
      });

      const result = await roochVDR.exists('did:rooch:0x123');
      expect(result).toBe(true);
      expect(mockClient.executeViewFunction).toHaveBeenCalledWith({
        target: '0x3::did::exists_did_for_address',
        args: [{ value: '0x123', type: 'address' }],
      });
    });

    it('should return false when DID does not exist', async () => {
      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ decoded_value: false }],
      });

      const result = await roochVDR.exists('did:rooch:0x456');
      expect(result).toBe(false);
    });

    it('should return false for invalid DID format', async () => {
      const result = await roochVDR.exists('invalid:did:format');
      expect(result).toBe(false);
    });
  });

  describe('store', () => {
    it('should store a DID document successfully', async () => {
      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: 'did:rooch:0x123',
        controller: ['did:rooch:0x123'],
        verificationMethod: [
          {
            id: 'did:rooch:0x123#account-key',
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: 'did:rooch:0x123',
            publicKeyMultibase: 'z4MXj1wBzi9jUstyPMS4jQqB6KdJaiatPkAtVtGc6bQEQEEsKTic',
          },
        ],
        authentication: ['did:rooch:0x123#account-key'],
        assertionMethod: ['did:rooch:0x123#account-key'],
        capabilityInvocation: ['did:rooch:0x123#account-key'],
        capabilityDelegation: ['did:rooch:0x123#account-key'],
      };

      mockClient.signAndExecuteTransaction.mockResolvedValue({
        execution_info: { status: { type: 'executed' } },
      });

      const result = await roochVDR.store(didDocument, { signer: mockSigner });
      expect(result).toBe(true);
    });

    it('should throw error when no verification method is provided', async () => {
      const didDocument: DIDDocument = {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: 'did:rooch:0x123',
        controller: ['did:rooch:0x123'],
        verificationMethod: [],
      };

      await expect(roochVDR.store(didDocument, { signer: mockSigner })).rejects.toThrow(
        'DID document must have at least one verification method'
      );
    });
  });

  describe('createViaCADOP', () => {
    it('should create DID via CADOP successfully', async () => {
      mockClient.signAndExecuteTransaction.mockResolvedValue({
        execution_info: { status: { type: 'executed' } },
      });

      const result = await roochVDR.createViaCADOP(
        'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        'Ed25519VerificationKey2020',
        { signer: mockSigner }
      );

      expect(result).toBe(true);
      expect(mockClient.signAndExecuteTransaction).toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('should resolve a DID document', async () => {
      const mockMoveDoc = {
        value: {
          id: { 
            value: { 
              method: 'rooch', 
              identifier: '0x123' 
            } 
          },
          controller: { 
            value: [['rooch', '0x123']] 
          },
          verification_methods: {
            value: {
              data: []
            }
          },
          authentication: { value: [] },
          assertion_method: { value: [] },
          capability_invocation: { value: [] },
          capability_delegation: { value: [] },
          key_agreement: { value: [] },
          services: { value: { data: [] } },
          also_known_as: []
        }
      };

      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ decoded_value: mockMoveDoc }],
      });

      const result = await roochVDR.resolve('did:rooch:0x123');
      expect(result).toBeTruthy();
      expect(result?.id).toBe('did:rooch:0x123');
    });

    it('should return null when DID is not found', async () => {
      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Failed',
        return_values: null,
      });

      const result = await roochVDR.resolve('did:rooch:0x456');
      expect(result).toBeNull();
    });
  });

  describe('addVerificationMethod', () => {
    it('should add verification method successfully', async () => {
      // Mock resolve to return a valid DID document first
      const mockMoveDoc = {
        value: {
          id: { 
            value: { 
              method: 'rooch', 
              identifier: '0x123' 
            } 
          },
          controller: { 
            value: [['rooch', '0x123']] 
          },
          verification_methods: {
            value: {
              data: [{
                id: { value: 'key-1' },
                type: { value: 'Ed25519VerificationKey2020' },
                controller: { value: ['rooch', '0x123'] },
                public_key: { value: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }
              }]
            }
          },
          authentication: { value: ['key-1'] },
          assertion_method: { value: ['key-1'] },
          capability_invocation: { value: ['key-1'] },
          capability_delegation: { value: ['key-1'] },
          key_agreement: { value: [] },
          services: { value: { data: [] } },
          also_known_as: []
        }
      };

      // First call is for resolve() in addVerificationMethod
      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ decoded_value: mockMoveDoc }],
      });

      const verificationMethod: VerificationMethod = {
        id: 'did:rooch:0x123#key-2',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:rooch:0x123',
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      };

      mockClient.signAndExecuteTransaction.mockResolvedValue({
        execution_info: { status: { type: 'executed' } },
      });

      const result = await roochVDR.addVerificationMethod(
        'did:rooch:0x123',
        verificationMethod,
        ['authentication', 'assertionMethod'],
        { signer: mockSigner }
      );

      expect(result).toBe(true);
    });
  });

  describe('addService', () => {
    it('should add service successfully', async () => {
      // Mock resolve to return a valid DID document first
      const mockMoveDoc = {
        value: {
          id: { 
            value: { 
              method: 'rooch', 
              identifier: '0x123' 
            } 
          },
          controller: { 
            value: [['rooch', '0x123']] 
          },
          verification_methods: {
            value: {
              data: [{
                id: { value: 'key-1' },
                type: { value: 'Ed25519VerificationKey2020' },
                controller: { value: ['rooch', '0x123'] },
                public_key: { value: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }
              }]
            }
          },
          authentication: { value: ['key-1'] },
          assertion_method: { value: ['key-1'] },
          capability_invocation: { value: ['key-1'] },
          capability_delegation: { value: ['key-1'] },
          key_agreement: { value: [] },
          services: { value: { data: [] } },
          also_known_as: []
        }
      };

      // First call is for resolve() in addService
      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ decoded_value: mockMoveDoc }],
      });

      mockClient.signAndExecuteTransaction.mockResolvedValue({
        execution_info: { status: { type: 'executed' } },
      });

      const result = await roochVDR.addService(
        'did:rooch:0x123',
        {
          id: 'did:rooch:0x123#service-1',
          type: 'LinkedDomains',
          serviceEndpoint: 'https://example.com',
        },
        { signer: mockSigner }
      );

      expect(result).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should convert verification relationships correctly', () => {
      const vdr = roochVDR as any; // Access private methods for testing
      
      expect(vdr.convertVerificationRelationship('authentication')).toBe(0);
      expect(vdr.convertVerificationRelationship('assertionMethod')).toBe(1);
      expect(vdr.convertVerificationRelationship('capabilityInvocation')).toBe(2);
      expect(vdr.convertVerificationRelationship('capabilityDelegation')).toBe(3);
      expect(vdr.convertVerificationRelationship('keyAgreement')).toBe(4);
    });

    it('should extract fragment from ID correctly', () => {
      const vdr = roochVDR as any; // Access private methods for testing
      
      expect(vdr.extractFragmentFromId('did:rooch:0x123#key-1')).toBe('key-1');
      expect(vdr.extractFragmentFromId('did:rooch:0x123#service-1')).toBe('service-1');
    });

    it('should throw error for invalid ID format', () => {
      const vdr = roochVDR as any; // Access private methods for testing
      
      expect(() => vdr.extractFragmentFromId('did:rooch:0x123')).toThrow(
        'Invalid ID format: did:rooch:0x123. Expected format: did:rooch:address#fragment'
      );
    });
  });
}); 