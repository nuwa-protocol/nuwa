import { RoochVDR } from '../roochVDR';
import { DIDDocument, VerificationMethod } from '../../../types';
import { 
  RoochClient, 
  Transaction, 
  Args, 
  ObjectStateView,
  AnnotatedFunctionReturnValueView,
  FunctionReturnValueView,
  ExecuteTransactionResponseView,
} from '@roochnetwork/rooch-sdk';

// Only mock RPC-related functionality
jest.mock('@roochnetwork/rooch-sdk', () => {
  const actualSdk = jest.requireActual('@roochnetwork/rooch-sdk');
  
  return {
    ...actualSdk, // Use actual SDK implementations for everything except what we explicitly mock
    RoochClient: jest.fn().mockImplementation(() => ({
      executeViewFunction: jest.fn(),
      signAndExecuteTransaction: jest.fn(),
      getObjectStates: jest.fn(),
    })),
    Transaction: jest.fn().mockImplementation(() => ({
      callFunction: jest.fn(),
    })),
    getRoochNodeUrl: jest.fn((network) => {
      const networkMap: { [key: string]: string } = {
        'dev': 'localnet',
        'test': 'testnet', 
        'main': 'mainnet'
      };
      const roochNetwork = networkMap[network] || network;
      return `https://${roochNetwork}-seed.rooch.network/`;
    }),
  };
});

describe('RoochVDR', () => {
  let roochVDR: RoochVDR;
  let mockClient: jest.Mocked<RoochClient>;

  beforeEach(() => {
    mockClient = {
      executeViewFunction: jest.fn(),
      signAndExecuteTransaction: jest.fn(),
      getObjectStates: jest.fn(),
      getRoochAddress: jest.fn().mockReturnValue({
        toBech32Address: jest.fn().mockReturnValue('rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3')
      })
    } as unknown as jest.Mocked<RoochClient>;

    roochVDR = new RoochVDR({
      rpcUrl: 'https://test-seed.rooch.network/',
      client: mockClient,
    });
  });

  describe('resolve', () => {
    it('should resolve a DID document', async () => {
      const mockObjectState: ObjectStateView = {
        value: '0x05726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330105726f6f636840726f6f636831686a37337a673434656e6d30657a667a767a73757434326b6d36796368733665657a633334636567636337346b77753339613673796d6e667466010b6163636f756e742d6b657905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367332e7a3233484a517a7651394177474241366e4e6772733170636943697564456f59536d706671516342556f62775158010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900000013f33f1da3823e2a3ace28b27a09b58278a6bec446894186fe156d44ccbf138e',
        id: '0x123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        flag: 0,
        object_type: '0x1::did::DIDDocument',
        owner: '0x123',
        size: '1024',
        decoded_value: null,
        display_fields: null,
        state_root: null,
        owner_bitcoin_address: null
      };

      mockClient.getObjectStates.mockResolvedValue([mockObjectState]);

      const result = await roochVDR.resolve('did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3');
      expect(result).toBeTruthy();
      expect(result?.id).toBe('did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3');
      expect(result?.['@context']).toEqual(['https://www.w3.org/ns/did/v1']);
      expect(result?.controller).toBeTruthy();
      expect(result?.controller![0]).toBe('did:rooch:rooch1hj73zg44enm0ezfzvzsut42km6ychs6eezc34cegcc74kwu39a6symnftf');
    });

    it('should return null when DID is not found', async () => {
      mockClient.getObjectStates.mockResolvedValue([]);

      const result = await roochVDR.resolve('did:rooch:0x456');
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true when DID exists', async () => {
      const returnValue: FunctionReturnValueView = {
        type_tag: 'bool',
        value: 'true',
      };

      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ value: returnValue, decoded_value: true }] as AnnotatedFunctionReturnValueView[],
      });

      const result = await roochVDR.exists('did:rooch:0x123');
      expect(result).toBe(true);
    });

    it('should return false when DID does not exist', async () => {
      const returnValue: FunctionReturnValueView = {
        type_tag: 'bool',
        value: 'false',
      };

      mockClient.executeViewFunction.mockResolvedValue({
        vm_status: 'Executed',
        return_values: [{ value: returnValue, decoded_value: false }] as AnnotatedFunctionReturnValueView[],
      });

      const result = await roochVDR.exists('did:rooch:0x456');
      expect(result).toBe(false);
    });

    it('should return false for invalid DID format', async () => {
      const result = await roochVDR.exists('invalid:did:format');
      expect(result).toBe(false);
    });
  });

  describe('addVerificationMethod', () => {
    it('should add verification method successfully', async () => {
      const mockObjectState: ObjectStateView = {
        value: '0x05726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330105726f6f636840726f6f636831686a37337a673434656e6d30657a667a767a73757434326b6d36796368733665657a633334636567636337346b77753339613673796d6e667466010b6163636f756e742d6b657905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367332e7a3233484a517a7651394177474241366e4e6772733170636943697564456f59536d706671516342556f62775158010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900000013f33f1da3823e2a3ace28b27a09b58278a6bec446894186fe156d44ccbf138e',
        id: '0x123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        flag: 0,
        object_type: '0x1::did::DIDDocument',
        owner: '0x123',
        size: '1024',
        decoded_value: null,
        display_fields: null,
        state_root: null,
        owner_bitcoin_address: null
      };

      mockClient.getObjectStates.mockResolvedValue([mockObjectState]);

      const mockExecutionInfo: ExecuteTransactionResponseView = {
        execution_info: {
          event_root: '0x123',
          gas_used: '1000',
          state_root: '0x456',
          tx_hash: '0x789',
          status: { type: 'executed' },
        },
        sequence_info: {
          tx_order: '1',
          tx_accumulator_root: '0x123',
          tx_order_signature: '0x456',
          tx_timestamp: '2024-01-01T00:00:00Z'
        },
      };

      mockClient.signAndExecuteTransaction.mockResolvedValue(mockExecutionInfo);

      const verificationMethod: VerificationMethod = {
        id: 'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#key-2',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3',
        publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      };

      const mockSigner = {
        getRoochAddress: jest.fn().mockReturnValue({
          toBech32Address: jest.fn().mockReturnValue('rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3')
        })
      };

      const result = await roochVDR.addVerificationMethod(
        'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3',
        verificationMethod,
        ['authentication', 'assertionMethod'],
        { signer: mockSigner }
      );

      expect(result).toBe(true);
    });
  });

  describe('addService', () => {
    it('should add service successfully', async () => {
      const mockObjectState: ObjectStateView = {
        value: '0x05726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330105726f6f636840726f6f636831686a37337a673434656e6d30657a667a767a73757434326b6d36796368733665657a633334636567636337346b77753339613673796d6e667466010b6163636f756e742d6b657905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367330b6163636f756e742d6b6579214563647361536563703235366b31566572696669636174696f6e4b65793230313905726f6f636840726f6f6368317a30656e3738647273676c7a35776b77397a6538357a64347366753264306b7967367935727068377a346b35666e396c7a7738716b63637367332e7a3233484a517a7651394177474241366e4e6772733170636943697564456f59536d706671516342556f62775158010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b6579010b6163636f756e742d6b657900000013f33f1da3823e2a3ace28b27a09b58278a6bec446894186fe156d44ccbf138e',
        id: '0x123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        flag: 0,
        object_type: '0x1::did::DIDDocument',
        owner: '0x123',
        size: '1024',
        decoded_value: null,
        display_fields: null,
        state_root: null,
        owner_bitcoin_address: null
      };

      mockClient.getObjectStates.mockResolvedValue([mockObjectState]);

      const mockExecutionInfo: ExecuteTransactionResponseView = {
        execution_info: {
          event_root: '0x123',
          gas_used: '1000',
          state_root: '0x456',
          tx_hash: '0x789',
          status: { type: 'executed' },
        },
        sequence_info: {
          tx_order: '1',
          tx_accumulator_root: '0x123',
          tx_order_signature: '0x456',
          tx_timestamp: '2024-01-01T00:00:00Z'
        },
      };

      mockClient.signAndExecuteTransaction.mockResolvedValue(mockExecutionInfo);

      const mockSigner = {
        getRoochAddress: jest.fn().mockReturnValue({
          toBech32Address: jest.fn().mockReturnValue('rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3')
        })
      };

      const result = await roochVDR.addService(
        'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3',
        {
          id: 'did:rooch:rooch1z0en78drsglz5wkw9ze85zd4sfu2d0kyg6y5rph7z4k5fn9lzw8qkccsg3#service-1',
          type: 'LinkedDomains',
          serviceEndpoint: 'https://example.com'
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