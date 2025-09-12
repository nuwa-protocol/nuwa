// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChannelManager } from '../ChannelManager';
import { PaymentState } from '../PaymentState';
import { PaymentChannelPayerClient } from '../../../../client/PaymentChannelPayerClient';
import { DidAuthHelper } from '../../internal/DidAuthHelper';
import type { HostChannelMappingStore } from '../../types';

// Mock dependencies
jest.mock('../../../../client/PaymentChannelPayerClient');
const mockGenerateAuthHeader = jest.fn();
jest.mock('../../internal/DidAuthHelper', () => ({
  DidAuthHelper: {
    generateAuthHeader: mockGenerateAuthHeader,
  },
}));

describe('ChannelManager', () => {
  let channelManager: ChannelManager;
  let paymentState: PaymentState;
  let mockPayerClient: jest.Mocked<PaymentChannelPayerClient>;
  let mockMappingStore: jest.Mocked<HostChannelMappingStore>;
  let mockFetch: jest.Mock;
  let mockSigner: any;

  beforeEach(() => {
    paymentState = new PaymentState();

    mockPayerClient = {
      signSubRAV: jest.fn(),
      openChannel: jest.fn(),
      openChannelWithSubChannel: jest.fn(),
      getChannelInfo: jest.fn(),
      getSubChannelInfo: jest.fn(),
      authorizeSubChannel: jest.fn(),
      closeChannel: jest.fn(),
    } as any;

    mockMappingStore = {
      getState: jest.fn(),
      setState: jest.fn(),
      deleteState: jest.fn(),
    };

    mockFetch = jest.fn();

    mockSigner = {
      getDid: jest.fn().mockResolvedValue('did:example:user'),
      sign: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    } as any;

    channelManager = new ChannelManager({
      host: 'api.example.com',
      baseUrl: 'https://api.example.com',
      payerClient: mockPayerClient,
      paymentState,
      mappingStore: mockMappingStore,
      fetchImpl: mockFetch as any,
      signer: mockSigner,
      keyId: 'did:example:user#key-1',
      payerDid: 'did:example:user',
      payeeDid: 'did:example:payee',
      defaultAssetId: '0x3::gas_coin::RGas',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('discoverService', () => {
    it('should discover service endpoints successfully', async () => {
      const discoveryResponse = {
        version: '1.0',
        endpoints: {
          recovery: '/recovery',
          health: '/health',
          commit: '/commit',
        },
        paymentHub: {
          chainId: '4',
          address: '0xhub',
        },
        payee: {
          did: 'did:example:payee',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue(discoveryResponse),
      } as any);

      const result = await channelManager.discoverService();

      expect(result).toEqual(discoveryResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/.well-known/nuwa-payment/info',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should throw error on discovery failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      await expect(channelManager.discoverService()).rejects.toThrow('Service discovery failed');
    });
  });

  describe('recoverFromService', () => {
    it('should recover channel state from service', async () => {
      // Mock DID auth header
      mockGenerateAuthHeader.mockResolvedValue('Bearer token');

      const recoveryData = {
        channelId: 'channel-123',
        pendingSubRav: {
          version: 1,
          chainId: BigInt(4),
          channelId: 'channel-123',
          channelEpoch: BigInt(1),
          vmIdFragment: 'key-1',
          nonce: BigInt(1),
          accumulatedAmount: BigInt(100),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue(recoveryData),
      } as any);

      // Set keyId and vmIdFragment in payment state
      paymentState.setKeyInfo('did:example:user#key-1', 'key-1');

      const result = await channelManager.recoverFromService();

      expect(result).toMatchObject({
        channelId: 'channel-123',
        pendingSubRav: expect.objectContaining({
          channelId: 'channel-123',
          nonce: BigInt(1),
        }),
      } as any);
    });

    it('should handle recovery when no data exists', async () => {
      mockGenerateAuthHeader.mockResolvedValue('Bearer token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue({}),
      } as any);

      const result = await channelManager.recoverFromService();

      expect(result).toEqual({});
    });
  });

  // Note: health method is not exposed in ChannelManager
  // It may be accessed through the HttpClient instead

  describe('commitSubRAV', () => {
    it('should commit SubRAV successfully', async () => {
      const subRav = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };

      const signedSubRav = {
        subRav,
        signature: new Uint8Array([1, 2, 3]),
      };

      mockGenerateAuthHeader.mockResolvedValue('Bearer token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: jest.fn().mockResolvedValue('OK'),
      } as any);

      await channelManager.commitSubRAV(signedSubRav);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/commit'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      );
    });
  });

  describe('channel management', () => {
    it('should ensure channel is ready', async () => {
      // First, discover service
      const discoveryResponse = {
        version: '1.0',
        endpoints: {
          recovery: '/recovery',
          health: '/health',
          commit: '/commit',
        },
        paymentHub: {
          chainId: '4',
          address: '0xhub',
        },
        payee: {
          did: 'did:example:payee',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: jest.fn().mockResolvedValue(discoveryResponse),
      } as any);

      // Set up state retrieval - no existing channel
      mockMappingStore.getState.mockResolvedValue(undefined);

      // Mock channel creation with sub-channel and include returned infos to avoid extra lookups
      mockPayerClient.openChannelWithSubChannel.mockResolvedValue({
        channelId: 'new-channel-456',
        txHash: '0x123',
        events: [],
        channelInfo: {
          channelId: 'new-channel-456',
          payerDid: 'did:example:user',
          payeeDid: 'did:example:payee',
          assetId: '0x3::gas_coin::RGas',
          epoch: BigInt(1),
          status: 'active',
        },
        subChannelInfo: {
          channelId: 'new-channel-456',
          epoch: BigInt(1),
          vmIdFragment: 'key-1',
          lastClaimedAmount: BigInt(0),
          lastConfirmedNonce: BigInt(0),
          lastUpdated: Date.now(),
        },
      } as any);

      // Ensure channel is ready
      await channelManager.ensureChannelReady();

      expect(paymentState.getChannelId()).toBe('new-channel-456');
      expect(mockPayerClient.openChannelWithSubChannel).toHaveBeenCalledWith({
        payeeDid: 'did:example:payee',
        assetId: '0x3::gas_coin::RGas',
      } as any);
    });

    it('should use existing channel from state', async () => {
      const existingState = {
        channelId: 'existing-channel-123',
        lastUpdated: new Date().toISOString(),
      };

      mockMappingStore.getState.mockResolvedValue(existingState);

      mockPayerClient.getChannelInfo.mockResolvedValue({
        channelId: 'existing-channel-123',
        payerDid: 'did:example:user',
        payeeDid: 'did:example:payee',
        assetId: '0x3::gas_coin::RGas',
        epoch: BigInt(1),
        status: 'active',
      } as any);

      await channelManager.ensureChannelReady();

      expect(paymentState.getChannelId()).toBe('existing-channel-123');
      expect(mockPayerClient.openChannelWithSubChannel).not.toHaveBeenCalled();
    });
  });
});
