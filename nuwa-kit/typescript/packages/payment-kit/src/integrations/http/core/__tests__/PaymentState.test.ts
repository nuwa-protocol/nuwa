import { PaymentState } from '../PaymentState';
import type { SubRAV } from '../../../../core/types';
import { HttpPaymentCodec } from '../../../../middlewares/http/HttpPaymentCodec';

describe('PaymentState', () => {
  let state: PaymentState;

  beforeEach(() => {
    state = new PaymentState();
  });

  describe('Channel Management', () => {
    it('should set and get channel ID', () => {
      expect(state.getChannelId()).toBeUndefined();

      state.setChannelId('channel-123');
      expect(state.getChannelId()).toBe('channel-123');

      state.setChannelId(undefined);
      expect(state.getChannelId()).toBeUndefined();
    });

    it('should set and get channel info', () => {
      const channelInfo = {
        channelId: 'channel-123',
        payerDid: 'did:example:payer',
        payeeDid: 'did:example:payee',
        assetId: '0x3::gas_coin::RGas',
        epoch: BigInt(1),
        status: 'active' as const,
      };

      expect(state.getChannelInfo()).toBeUndefined();

      state.setChannelInfo(channelInfo);
      expect(state.getChannelInfo()).toEqual(channelInfo);
    });
  });

  describe('Key Management', () => {
    it('should set and get key info', () => {
      expect(state.getKeyId()).toBeUndefined();
      expect(state.getVmIdFragment()).toBeUndefined();

      state.setKeyInfo('did:example:user#key-1', 'key-1');
      expect(state.getKeyId()).toBe('did:example:user#key-1');
      expect(state.getVmIdFragment()).toBe('key-1');
    });
  });

  describe('Pending SubRAV Management', () => {
    it('should set and get pending SubRAV', () => {
      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };

      // Set key info first to pass fragment validation
      state.setKeyInfo('did:example:user#key-1', 'key-1');

      expect(state.getPendingSubRAV()).toBeUndefined();

      state.setPendingSubRAV(subRav);
      expect(state.getPendingSubRAV()).toEqual(subRav);

      state.clearPendingSubRAV();
      expect(state.getPendingSubRAV()).toBeUndefined();
    });

    it('should reject SubRAV with mismatched fragment', () => {
      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-2',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };

      state.setKeyInfo('did:example:user#key-1', 'key-1');
      state.setPendingSubRAV(subRav);

      // Should not be set due to fragment mismatch
      expect(state.getPendingSubRAV()).toBeUndefined();
    });

    it('should enforce monotonic nonce progression', () => {
      state.setKeyInfo('did:example:user#key-1', 'key-1');

      const subRav1: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(5),
        accumulatedAmount: BigInt(100),
      };

      const subRav2: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(3), // Lower nonce
        accumulatedAmount: BigInt(200),
      };

      state.setPendingSubRAV(subRav1);
      expect(state.getPendingSubRAV()).toEqual(subRav1);

      // Should reject lower nonce
      state.setPendingSubRAV(subRav2);
      expect(state.getPendingSubRAV()).toEqual(subRav1);

      // Update highest nonce
      state.updateHighestNonce(BigInt(10));

      // Should reject anything <= 10 now
      const subRav3: SubRAV = {
        ...subRav1,
        nonce: BigInt(8),
      };
      state.setPendingSubRAV(subRav3);
      expect(state.getPendingSubRAV()).toEqual(subRav1); // Still the old one
    });
  });

  describe('Pending Payments Management', () => {
    it('should add and remove pending payments', () => {
      const pending = {
        resolve: jest.fn(),
        reject: jest.fn(),
        timestamp: new Date(),
        channelId: 'channel-123',
        assetId: '0x3::gas_coin::RGas',
        timeoutId: setTimeout(() => {}, 1000) as any,
        requestContext: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          clientTxRef: 'tx-123',
        },
      };

      expect(state.getPendingPayment('tx-123')).toBeUndefined();

      state.addPendingPayment('tx-123', pending);
      expect(state.getPendingPayment('tx-123')).toEqual(pending);

      state.removePendingPayment('tx-123');
      expect(state.getPendingPayment('tx-123')).toBeUndefined();

      clearTimeout(pending.timeoutId);
    });

    it('should clear all pending payments', () => {
      state.addPendingPayment('tx-1', {} as any);
      state.addPendingPayment('tx-2', {} as any);
      state.addPendingPayment('tx-3', {} as any);

      expect(state.getAllPendingPayments().size).toBe(3);

      state.clearAllPendingPayments();
      expect(state.getAllPendingPayments().size).toBe(0);
    });
  });

  describe('Rejected refs tracking', () => {
    it('should mark and check rejected refs', () => {
      expect(state.isRecentlyRejected('tx-123')).toBe(false);

      state.markAsRejected('tx-123');
      expect(state.isRecentlyRejected('tx-123')).toBe(true);
    });
  });

  describe('State persistence', () => {
    it('should get persisted state', () => {
      state.setChannelId('channel-123');
      state.setKeyInfo('did:example:user#key-1', 'key-1');

      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };
      state.setPendingSubRAV(subRav);

      const persisted = state.getPersistedState();
      expect(persisted.channelId).toBe('channel-123');
      expect(persisted.pendingSubRAV).toEqual(HttpPaymentCodec.serializeSubRAV(subRav));
      expect(persisted.lastUpdated).toBeDefined();
    });

    it('should load persisted state', () => {
      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };

      const persistedState = {
        channelId: 'channel-456',
        pendingSubRAV: HttpPaymentCodec.serializeSubRAV(subRav),
        lastUpdated: new Date().toISOString(),
      };

      // Need to set key info for SubRAV validation
      state.setKeyInfo('did:example:user#key-1', 'key-1');

      state.loadPersistedState(persistedState);
      expect(state.getChannelId()).toBe('channel-456');
      expect(state.getPendingSubRAV()).toEqual(subRav);
    });
  });

  describe('State reset', () => {
    it('should reset all state', () => {
      // Set up some state
      state.setChannelId('channel-123');
      state.setKeyInfo('did:example:user#key-1', 'key-1');
      state.addPendingPayment('tx-123', {} as any);
      state.markAsRejected('tx-456');

      const subRav: SubRAV = {
        version: 1,
        chainId: BigInt(4),
        channelId: 'channel-123',
        channelEpoch: BigInt(1),
        vmIdFragment: 'key-1',
        nonce: BigInt(1),
        accumulatedAmount: BigInt(100),
      };
      state.setPendingSubRAV(subRav);

      // Reset
      state.reset();

      // Verify everything is cleared
      expect(state.getChannelId()).toBeUndefined();
      expect(state.getKeyId()).toBeUndefined();
      expect(state.getVmIdFragment()).toBeUndefined();
      expect(state.getPendingSubRAV()).toBeUndefined();
      expect(state.getAllPendingPayments().size).toBe(0);
      expect(state.isRecentlyRejected('tx-456')).toBe(false);
    });
  });
});
