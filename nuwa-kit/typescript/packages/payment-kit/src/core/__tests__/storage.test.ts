/**
 * Storage Layer Tests
 * 
 * Tests for the improved storage interfaces with pagination and proper key isolation
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { 
  ChannelStateStorage, 
  PaginationParams, 
  ChannelFilter, 
  PaginatedResult 
} from '../BaseStorage';
import type { ChannelMetadata, SubChannelState } from '../types';

// Mock implementation for testing the improved interfaces
class MockChannelStateStorage implements ChannelStateStorage {
  private channels = new Map<string, ChannelMetadata>();
  private subChannels = new Map<string, SubChannelState>();

  async getChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
    return this.channels.get(channelId) || null;
  }

  async setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void> {
    this.channels.set(channelId, metadata);
  }

  async getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState> {
    const compositeKey = `${channelId}:${keyId}`;
    return this.subChannels.get(compositeKey) || {
      channelId,
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    };
  }

  async updateSubChannelState(channelId: string, keyId: string, updates: Partial<SubChannelState>): Promise<void> {
    const compositeKey = `${channelId}:${keyId}`;
    const existing = this.subChannels.get(compositeKey);
    const updated: SubChannelState = {
      channelId: updates.channelId || existing?.channelId || channelId,
      epoch: updates.epoch ?? existing?.epoch ?? BigInt(0),
      accumulatedAmount: updates.accumulatedAmount ?? existing?.accumulatedAmount ?? BigInt(0),
      nonce: updates.nonce ?? existing?.nonce ?? BigInt(0),
      lastUpdated: updates.lastUpdated || Date.now(),
    };
    this.subChannels.set(compositeKey, updated);
  }

  async clear(): Promise<void> {
    this.channels.clear();
    this.subChannels.clear();
  }

  // Extended interface methods (simplified for testing)
  async listChannelMetadata(filter?: ChannelFilter, pagination?: PaginationParams): Promise<PaginatedResult<ChannelMetadata>> {
    let channels = Array.from(this.channels.values());
    
    // Apply filters
    if (filter?.payerDid) {
      channels = channels.filter(ch => ch.payerDid === filter.payerDid);
    }
    if (filter?.status) {
      channels = channels.filter(ch => ch.status === filter.status);
    }

    const totalCount = channels.length;
    const offset = pagination?.offset || 0;
    const limit = pagination?.limit || 100;
    const items = channels.slice(offset, offset + limit);
    
    return {
      items,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    this.channels.delete(channelId);
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    const result: Record<string, SubChannelState> = {};
    for (const [compositeKey, state] of this.subChannels.entries()) {
      if (compositeKey.startsWith(`${channelId}:`)) {
        const keyId = compositeKey.substring(channelId.length + 1);
        result[keyId] = state;
      }
    }
    return result;
  }

  async removeSubChannelState(channelId: string, keyId: string): Promise<void> {
    const compositeKey = `${channelId}:${keyId}`;
    this.subChannels.delete(compositeKey);
  }

  async getStats(): Promise<any> {
    return {
      channelCount: this.channels.size,
      subChannelCount: this.subChannels.size,
      hitRate: 1.0,
    };
  }
}

describe('Improved Storage Interface', () => {
  let storage: MockChannelStateStorage;

  beforeEach(() => {
    storage = new MockChannelStateStorage();
  });

  describe('Channel Metadata with Pagination', () => {
    beforeEach(async () => {
      // Setup test data
      for (let i = 0; i < 15; i++) {
        const channel: ChannelMetadata = {
          channelId: `channel-${i}`,
          payerDid: `did:rooch:payer-${i % 3}`, // 3 different payers
          payeeDid: `did:rooch:payee-${i}`,
          asset: { assetId: '0x3::gas_coin::RGas' },
          totalCollateral: BigInt(1000000),
          epoch: BigInt(0),
          status: i % 5 === 0 ? 'closed' : 'active', // Some closed channels
        };
        await storage.setChannelMetadata(channel.channelId, channel);
      }
    });

    it('should list all channels without pagination', async () => {
      const result = await storage.listChannelMetadata();
      
      expect(result.items).toHaveLength(15);
      expect(result.totalCount).toBe(15);
      expect(result.hasMore).toBe(false);
    });

    it('should support pagination', async () => {
      const firstPage = await storage.listChannelMetadata(undefined, { offset: 0, limit: 5 });
      expect(firstPage.items).toHaveLength(5);
      expect(firstPage.totalCount).toBe(15);
      expect(firstPage.hasMore).toBe(true);

      const secondPage = await storage.listChannelMetadata(undefined, { offset: 5, limit: 5 });
      expect(secondPage.items).toHaveLength(5);
      expect(secondPage.totalCount).toBe(15);
      expect(secondPage.hasMore).toBe(true);

      const lastPage = await storage.listChannelMetadata(undefined, { offset: 10, limit: 10 });
      expect(lastPage.items).toHaveLength(5); // Only 5 remaining
      expect(lastPage.totalCount).toBe(15);
      expect(lastPage.hasMore).toBe(false);
    });

    it('should filter by payer DID', async () => {
      const result = await storage.listChannelMetadata({ payerDid: 'did:rooch:payer-0' });
      
      // Should have channels 0, 3, 6, 9, 12 (5 channels)
      expect(result.items).toHaveLength(5);
      expect(result.totalCount).toBe(5);
      result.items.forEach(channel => {
        expect(channel.payerDid).toBe('did:rooch:payer-0');
      });
    });

    it('should filter by status', async () => {
      const result = await storage.listChannelMetadata({ status: 'closed' });
      
      // Should have channels 0, 5, 10 (3 channels)
      expect(result.items).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      result.items.forEach(channel => {
        expect(channel.status).toBe('closed');
      });
    });

    it('should combine filters and pagination', async () => {
      const result = await storage.listChannelMetadata(
        { payerDid: 'did:rooch:payer-1' }, 
        { offset: 0, limit: 2 }
      );
      
      // Should have first 2 channels from payer-1 (channels 1, 4)
      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(5); // Total for this payer
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Sub-Channel State with Proper Key Isolation', () => {
    const CHANNEL_1 = 'channel-1';
    const CHANNEL_2 = 'channel-2';
    const KEY_ID = 'did:rooch:user#account-key';

    it('should isolate sub-channel states by channel ID', async () => {
      // Set different states for the same keyId in different channels
      await storage.updateSubChannelState(CHANNEL_1, KEY_ID, {
        channelId: CHANNEL_1,
        accumulatedAmount: BigInt(1000),
        nonce: BigInt(1),
      });

      await storage.updateSubChannelState(CHANNEL_2, KEY_ID, {
        channelId: CHANNEL_2,
        accumulatedAmount: BigInt(2000),
        nonce: BigInt(2),
      });

      // Verify they are isolated
      const state1 = await storage.getSubChannelState(CHANNEL_1, KEY_ID);
      const state2 = await storage.getSubChannelState(CHANNEL_2, KEY_ID);

      expect(state1.channelId).toBe(CHANNEL_1);
      expect(state1.accumulatedAmount).toBe(BigInt(1000));
      expect(state1.nonce).toBe(BigInt(1));

      expect(state2.channelId).toBe(CHANNEL_2);
      expect(state2.accumulatedAmount).toBe(BigInt(2000));
      expect(state2.nonce).toBe(BigInt(2));
    });

    it('should list sub-channel states for a specific channel', async () => {
      const KEY_1 = 'did:rooch:user1#account-key';
      const KEY_2 = 'did:rooch:user2#account-key';

      // Add states for channel 1
      await storage.updateSubChannelState(CHANNEL_1, KEY_1, {
        accumulatedAmount: BigInt(100),
        nonce: BigInt(1),
      });

      await storage.updateSubChannelState(CHANNEL_1, KEY_2, {
        accumulatedAmount: BigInt(200),
        nonce: BigInt(2),
      });

      // Add states for channel 2 (should not appear in channel 1 results)
      await storage.updateSubChannelState(CHANNEL_2, KEY_1, {
        accumulatedAmount: BigInt(300),
        nonce: BigInt(3),
      });

      const channel1States = await storage.listSubChannelStates(CHANNEL_1);
      
      expect(Object.keys(channel1States)).toHaveLength(2);
      expect(channel1States[KEY_1].accumulatedAmount).toBe(BigInt(100));
      expect(channel1States[KEY_2].accumulatedAmount).toBe(BigInt(200));
      
      // Verify channel 2 state is not included
      expect(channel1States[KEY_1].accumulatedAmount).not.toBe(BigInt(300));
    });

    it('should remove sub-channel state with proper isolation', async () => {
      const KEY_1 = 'did:rooch:user1#account-key';

      // Add states to both channels
      await storage.updateSubChannelState(CHANNEL_1, KEY_1, { accumulatedAmount: BigInt(100) });
      await storage.updateSubChannelState(CHANNEL_2, KEY_1, { accumulatedAmount: BigInt(200) });

      // Remove from channel 1 only
      await storage.removeSubChannelState(CHANNEL_1, KEY_1);

      // Verify channel 1 state is removed but channel 2 state remains
      const state1 = await storage.getSubChannelState(CHANNEL_1, KEY_1);
      const state2 = await storage.getSubChannelState(CHANNEL_2, KEY_1);

      expect(state1.accumulatedAmount).toBe(BigInt(0)); // Default value
      expect(state2.accumulatedAmount).toBe(BigInt(200)); // Preserved
    });
  });

  describe('Storage Statistics', () => {
    it('should provide accurate statistics', async () => {
      // Add some test data
      await storage.setChannelMetadata('ch1', {
        channelId: 'ch1',
        payerDid: 'did:rooch:payer',
        payeeDid: 'did:rooch:payee',
        asset: { assetId: '0x3::gas_coin::RGas' },
        totalCollateral: BigInt(1000),
        epoch: BigInt(0),
        status: 'active',
      });

      await storage.updateSubChannelState('ch1', 'key1', { accumulatedAmount: BigInt(100) });
      await storage.updateSubChannelState('ch1', 'key2', { accumulatedAmount: BigInt(200) });

      const stats = await storage.getStats();
      
      expect(stats.channelCount).toBe(1);
      expect(stats.subChannelCount).toBe(2);
    });
  });
});

describe('Storage Interface Problems - Solved', () => {
  it('should demonstrate the problems with old interface', () => {
    // 问题 1: listChannelMetadata() 返回所有数据，没有分页
    // 旧接口: listChannelMetadata(): Promise<ChannelMetadata[]>
    // 新接口: listChannelMetadata(filter?, pagination?): Promise<PaginatedResult<ChannelMetadata>>
    
    // 问题 2: getSubChannelState(keyId) 没有 channelId，可能冲突
    // 旧接口: getSubChannelState(keyId: string): Promise<SubChannelState>
    // 新接口: getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState>
    
    expect(true).toBe(true); // This test documents the improvements
  });
}); 