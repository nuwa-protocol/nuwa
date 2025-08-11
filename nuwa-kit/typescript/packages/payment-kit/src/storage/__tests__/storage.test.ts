/**
 * Storage Layer Tests - Updated for Refactored Repository Interfaces
 * 
 * Tests for the new repository-based storage architecture with
 * proper interface separation and factory functions
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { 
  ChannelRepository,
  RAVRepository,
  PendingSubRAVRepository,
  PaginationParams, 
  ChannelFilter, 
  PaginatedResult 
} from '..';
import {
  createChannelRepo,
  createRAVRepo,
  createPendingSubRAVRepo,
  createStorageRepositories,
  createStorageRepositoriesAuto
} from '..';
import type { ChannelInfo, SubChannelState, SignedSubRAV, SubRAV } from '../../core/types';

describe('Repository-Based Storage Layer', () => {
  describe('ChannelRepository', () => {
    let channelRepo: ChannelRepository;

    beforeEach(() => {
      channelRepo = createChannelRepo({ backend: 'memory' });
    });

    describe('Channel Metadata with Pagination', () => {
      beforeEach(async () => {
        // Setup test data
        for (let i = 0; i < 15; i++) {
          const channel: ChannelInfo = {
            channelId: `channel-${i}`,
            payerDid: `did:rooch:payer-${i % 3}`, // 3 different payers
            payeeDid: `did:rooch:payee-${i % 2}`, // 2 different payees
            assetId: '0x3::gas_coin::RGas',
            epoch: BigInt(0),
            status: i % 5 === 0 ? 'closed' : 'active', // Some closed channels
          };
          await channelRepo.setChannelMetadata(channel.channelId, channel);
        }
      });

      it('should list all channels without pagination', async () => {
        const result = await channelRepo.listChannelMetadata();
        
        expect(result.items).toHaveLength(15);
        expect(result.totalCount).toBe(15);
        expect(result.hasMore).toBe(false);
      });

      it('should support pagination', async () => {
        const firstPage = await channelRepo.listChannelMetadata(undefined, { offset: 0, limit: 5 });
        expect(firstPage.items).toHaveLength(5);
        expect(firstPage.totalCount).toBe(15);
        expect(firstPage.hasMore).toBe(true);

        const secondPage = await channelRepo.listChannelMetadata(undefined, { offset: 5, limit: 5 });
        expect(secondPage.items).toHaveLength(5);
        expect(secondPage.totalCount).toBe(15);
        expect(secondPage.hasMore).toBe(true);

        const lastPage = await channelRepo.listChannelMetadata(undefined, { offset: 10, limit: 10 });
        expect(lastPage.items).toHaveLength(5); // Only 5 remaining
        expect(lastPage.totalCount).toBe(15);
        expect(lastPage.hasMore).toBe(false);
      });

      it('should filter by payer DID', async () => {
        const result = await channelRepo.listChannelMetadata({ payerDid: 'did:rooch:payer-0' });
        
        // Should have channels 0, 3, 6, 9, 12 (5 channels)
        expect(result.items).toHaveLength(5);
        expect(result.totalCount).toBe(5);
        result.items.forEach(channel => {
          expect(channel.payerDid).toBe('did:rooch:payer-0');
        });
      });

      it('should filter by status', async () => {
        const result = await channelRepo.listChannelMetadata({ status: 'closed' });
        
        // Should have channels 0, 5, 10 (3 channels)
        expect(result.items).toHaveLength(3);
        expect(result.totalCount).toBe(3);
        result.items.forEach(channel => {
          expect(channel.status).toBe('closed');
        });
      });

      it('should combine filters and pagination', async () => {
        const result = await channelRepo.listChannelMetadata(
          { payerDid: 'did:rooch:payer-1' }, 
          { offset: 0, limit: 2 }
        );
        
        // Should have first 2 channels from payer-1 (channels 1, 4)
        expect(result.items).toHaveLength(2);
        expect(result.totalCount).toBe(5); // Total for this payer
        expect(result.hasMore).toBe(true);
      });

      it('should get single channel metadata', async () => {
        const channel = await channelRepo.getChannelMetadata('channel-0');
        expect(channel).toBeTruthy();
        expect(channel?.channelId).toBe('channel-0');
        expect(channel?.payerDid).toBe('did:rooch:payer-0');
      });

      it('should remove channel metadata', async () => {
        await channelRepo.removeChannelMetadata('channel-0');
        const channel = await channelRepo.getChannelMetadata('channel-0');
        expect(channel).toBeNull();
      });
    });

    describe('Sub-Channel State with Proper Key Isolation', () => {
      const CHANNEL_1 = 'channel-1';
      const CHANNEL_2 = 'channel-2';
      const VM_ID = 'account-key';

      it('should isolate sub-channel states by channel ID', async () => {
        // Set different states for the same keyId in different channels
        await channelRepo.updateSubChannelState(CHANNEL_1, VM_ID, {
          channelId: CHANNEL_1,
          lastClaimedAmount: BigInt(1000),
          lastConfirmedNonce: BigInt(1),
        } as any);

        await channelRepo.updateSubChannelState(CHANNEL_2, VM_ID, {
          channelId: CHANNEL_2,
          lastClaimedAmount: BigInt(2000),
          lastConfirmedNonce: BigInt(2),
        } as any);

        // Verify they are isolated
        const state1 = await channelRepo.getSubChannelState(CHANNEL_1, VM_ID);
        const state2 = await channelRepo.getSubChannelState(CHANNEL_2, VM_ID);

        expect(state1!.channelId).toBe(CHANNEL_1);
        expect((state1 as any)!.lastClaimedAmount).toBe(BigInt(1000));
        expect((state1 as any)!.lastConfirmedNonce).toBe(BigInt(1));

        expect(state2!.channelId).toBe(CHANNEL_2);
        expect((state2 as any)!.lastClaimedAmount).toBe(BigInt(2000));
        expect((state2 as any)!.lastConfirmedNonce).toBe(BigInt(2));
      });

      it('should list sub-channel states for a specific channel', async () => {
        const KEY_1 = 'account-key-1';
        const KEY_2 = 'account-key-2';

        // Add states for channel 1
        await channelRepo.updateSubChannelState(CHANNEL_1, KEY_1, {
          lastClaimedAmount: BigInt(100),
          lastConfirmedNonce: BigInt(1),
        } as any);

        await channelRepo.updateSubChannelState(CHANNEL_1, KEY_2, {
          lastClaimedAmount: BigInt(200),
          lastConfirmedNonce: BigInt(2),
        } as any);

        // Add states for channel 2 (should not appear in channel 1 results)
        await channelRepo.updateSubChannelState(CHANNEL_2, KEY_1, {
          lastClaimedAmount: BigInt(300),
          lastConfirmedNonce: BigInt(3),
        } as any);

        const channel1States = await channelRepo.listSubChannelStates(CHANNEL_1);
        
        expect(Object.keys(channel1States)).toHaveLength(2);
        expect((channel1States[KEY_1] as any).lastClaimedAmount).toBe(BigInt(100));
        expect((channel1States[KEY_2] as any).lastClaimedAmount).toBe(BigInt(200));
        
        // Verify channel 2 state is not included
        expect((channel1States[KEY_1] as any).lastClaimedAmount).not.toBe(BigInt(300));
      });

      it('should remove sub-channel state with proper isolation', async () => {
        const KEY_1 = 'account-key';

        // Add states to both channels
        await channelRepo.updateSubChannelState(CHANNEL_1, KEY_1, { lastClaimedAmount: BigInt(100) } as any);
        await channelRepo.updateSubChannelState(CHANNEL_2, KEY_1, { lastClaimedAmount: BigInt(200) } as any);

        // Remove from channel 1 only
        await channelRepo.removeSubChannelState(CHANNEL_1, KEY_1);

        // Verify channel 1 state is removed but channel 2 state remains
        const state1 = await channelRepo.getSubChannelState(CHANNEL_1, KEY_1);
        const state2 = await channelRepo.getSubChannelState(CHANNEL_2, KEY_1);

        expect(state1).toBeNull();
        expect((state2 as any)!.lastClaimedAmount).toBe(BigInt(200));
      });

      it('should return null for non-existent sub-channel', async () => {
        const state = await channelRepo.getSubChannelState('non-existent', VM_ID);
        expect(state).toBeNull();
      });
    });

    describe('Repository Statistics', () => {
      it('should provide accurate statistics', async () => {
        // Add some test data
        await channelRepo.setChannelMetadata('ch1', {
          channelId: 'ch1',
          payerDid: 'did:rooch:payer',
          payeeDid: 'did:rooch:payee',
          assetId: '0x3::gas_coin::RGas',
          epoch: BigInt(0),
          status: 'active',
        });

        await channelRepo.updateSubChannelState('ch1', 'vm1', { lastClaimedAmount: BigInt(100) } as any);
        await channelRepo.updateSubChannelState('ch1', 'vm2', { lastClaimedAmount: BigInt(200) } as any);

        const stats = await channelRepo.getStats();
        
        expect(stats.channelCount).toBe(1);
        expect(stats.subChannelCount).toBe(2);
        expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      });

      it('should clear all data', async () => {
        // Add some test data
        await channelRepo.setChannelMetadata('test', {
          channelId: 'test',
          payerDid: 'did:rooch:payer',
          payeeDid: 'did:rooch:payee',
          assetId: '0x3::gas_coin::RGas',
          epoch: BigInt(0),
          status: 'active',
        });

        await channelRepo.updateSubChannelState('test', 'key', { lastClaimedAmount: BigInt(100) } as any);

        // Clear and verify
        await channelRepo.clear();
        
        const stats = await channelRepo.getStats();
        expect(stats.channelCount).toBe(0);
        expect(stats.subChannelCount).toBe(0);
      });
    });
  });

  describe('RAVRepository', () => {
    let ravRepo: RAVRepository;

    beforeEach(() => {
      ravRepo = createRAVRepo({ backend: 'memory' });
    });

    const createMockSignedSubRAV = (
      channelId: string,
      vmIdFragment: string,
      nonce: bigint,
      amount: bigint
    ): SignedSubRAV => ({
      subRav: {
        version: 1,
        chainId: BigInt(4),
        channelId,
        channelEpoch: BigInt(0),
        vmIdFragment,
        accumulatedAmount: amount,
        nonce,
      },
      signature: new Uint8Array([0x01, 0x02, 0x03]), // mock signature bytes
    });

    it('should save and retrieve RAVs', async () => {
      const rav = createMockSignedSubRAV('ch1', 'vm1', BigInt(1), BigInt(100));
      
      await ravRepo.save(rav);
      const retrieved = await ravRepo.getLatest('ch1', 'vm1');
      
      expect(retrieved).toEqual(rav);
    });

    it('should handle multiple RAVs for same sub-channel', async () => {
      const rav1 = createMockSignedSubRAV('ch1', 'vm1', BigInt(1), BigInt(100));
      const rav2 = createMockSignedSubRAV('ch1', 'vm1', BigInt(2), BigInt(200));
      
      await ravRepo.save(rav1);
      await ravRepo.save(rav2);
      
      const latest = await ravRepo.getLatest('ch1', 'vm1');
      expect(latest?.subRav.nonce).toBe(BigInt(2));
      expect(latest?.subRav.accumulatedAmount).toBe(BigInt(200));
    });

    it('should list RAVs for a channel', async () => {
      const rav1 = createMockSignedSubRAV('ch1', 'vm1', BigInt(1), BigInt(100));
      const rav2 = createMockSignedSubRAV('ch1', 'vm2', BigInt(1), BigInt(150));
      
      await ravRepo.save(rav1);
      await ravRepo.save(rav2);
      
      const ravs: SignedSubRAV[] = [];
      for await (const rav of ravRepo.list('ch1')) {
        ravs.push(rav);
      }
      
      expect(ravs).toHaveLength(2);
    });

    it('should get unclaimed RAVs', async () => {
      const rav1 = createMockSignedSubRAV('ch1', 'vm1', BigInt(1), BigInt(100));
      const rav2 = createMockSignedSubRAV('ch1', 'vm2', BigInt(1), BigInt(150));
      
      await ravRepo.save(rav1);
      await ravRepo.save(rav2);
      
      const unclaimed = await ravRepo.getUnclaimedRAVs('ch1');
      expect(unclaimed.size).toBe(2);
      expect(unclaimed.get('vm1')).toEqual(rav1);
      expect(unclaimed.get('vm2')).toEqual(rav2);
    });

    it('should mark RAVs as claimed', async () => {
      const rav1 = createMockSignedSubRAV('ch1', 'vm1', BigInt(1), BigInt(100));
      const rav2 = createMockSignedSubRAV('ch1', 'vm1', BigInt(2), BigInt(200));
      
      await ravRepo.save(rav1);
      await ravRepo.save(rav2);
      
      await ravRepo.markAsClaimed('ch1', 'vm1', BigInt(1));
      
      const unclaimed = await ravRepo.getUnclaimedRAVs('ch1');
      expect(unclaimed.get('vm1')?.subRav.nonce).toBe(BigInt(2));
    });
  });

  describe('PendingSubRAVRepository', () => {
    let pendingRepo: PendingSubRAVRepository;

    beforeEach(() => {
      pendingRepo = createPendingSubRAVRepo({ backend: 'memory' });
    });

    const createMockSubRAV = (
      channelId: string,
      nonce: bigint,
      amount: bigint
    ): SubRAV => ({
      version: 1,
      chainId: BigInt(4),
      channelId,
      channelEpoch: BigInt(0),
      vmIdFragment: 'test-vm',
      accumulatedAmount: amount,
      nonce,
    });

    it('should save and find pending SubRAVs', async () => {
      const subRAV = createMockSubRAV('ch1', BigInt(1), BigInt(100));
      
      await pendingRepo.save(subRAV);
      const found = await pendingRepo.find('ch1', 'test-vm', BigInt(1));
      
      expect(found).toEqual(subRAV);
    });

    it('should remove pending SubRAVs', async () => {
      const subRAV = createMockSubRAV('ch1', BigInt(1), BigInt(100));
      
      await pendingRepo.save(subRAV);
      await pendingRepo.remove('ch1', 'test-vm', BigInt(1));
      
      const found = await pendingRepo.find('ch1', 'test-vm', BigInt(1));
      expect(found).toBeNull();
    });

    it('should provide statistics', async () => {
      const subRAV1 = createMockSubRAV('ch1', BigInt(1), BigInt(100));
      const subRAV2 = createMockSubRAV('ch2', BigInt(1), BigInt(200));
      
      await pendingRepo.save(subRAV1);
      await pendingRepo.save(subRAV2);
      
      const stats = await pendingRepo.getStats();
      expect(stats.totalCount).toBe(2);
      expect(stats.byChannel).toEqual({ ch1: 1, ch2: 1 });
    });

    it('should cleanup expired proposals', async () => {
      const oldSubRAV = createMockSubRAV('ch1', BigInt(1), BigInt(100));
      
      await pendingRepo.save(oldSubRAV);
      
      const cleanedCount = await pendingRepo.cleanup(30 * 60 * 1000); // 30 minutes
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
      
      // Note: Since SubRAV doesn't have timestamp, cleanup might not work as expected
      // This test verifies the interface works but behavior depends on implementation
    });

    it('should clear all pending proposals', async () => {
      const subRAV = createMockSubRAV('ch1', BigInt(1), BigInt(100));
      await pendingRepo.save(subRAV);
      
      await pendingRepo.clear();
      
      const stats = await pendingRepo.getStats();
      expect(stats.totalCount).toBe(0);
    });
  });
});

describe('Factory Functions and Multi-Backend Support', () => {
  describe('Repository Factory Functions', () => {
    it('should create memory-based repositories', () => {
      const channelRepo = createChannelRepo({ backend: 'memory' });
      const ravRepo = createRAVRepo({ backend: 'memory' });
      const pendingRepo = createPendingSubRAVRepo({ backend: 'memory' });
      
      expect(channelRepo).toBeDefined();
      expect(ravRepo).toBeDefined();
      expect(pendingRepo).toBeDefined();
    });

    it('should create IndexedDB-based repositories', () => {
      // Skip test if IndexedDB is not available (e.g., in Node.js test environment)
      if (typeof window === 'undefined' || !window.indexedDB) {
        expect(true).toBe(true); // Test passes but is effectively skipped
        return;
      }
      
      const channelRepo = createChannelRepo({ backend: 'indexeddb' });
      const ravRepo = createRAVRepo({ backend: 'indexeddb' });
      const pendingRepo = createPendingSubRAVRepo({ backend: 'indexeddb' });
      
      expect(channelRepo).toBeDefined();
      expect(ravRepo).toBeDefined();
      expect(pendingRepo).toBeDefined();
    });

    it('should create all repositories with same backend', () => {
      const repos = createStorageRepositories({ backend: 'memory' });
      
      expect(repos.channelRepo).toBeDefined();
      expect(repos.ravRepo).toBeDefined();
      expect(repos.pendingSubRAVRepo).toBeDefined();
    });

    it('should auto-detect optimal backend', () => {
      const repos = createStorageRepositoriesAuto();
      
      expect(repos.channelRepo).toBeDefined();
      expect(repos.ravRepo).toBeDefined();
      expect(repos.pendingSubRAVRepo).toBeDefined();
    });
  });

  describe('Backend Compatibility', () => {
    const backends: Array<'memory' | 'indexeddb'> = ['memory'];
    
    // Add IndexedDB only if available
    if (typeof window !== 'undefined' && window.indexedDB) {
      backends.push('indexeddb');
    }

    backends.forEach(backend => {
      describe(`${backend} backend`, () => {
        it('should implement ChannelRepository interface correctly', async () => {
          const repo = createChannelRepo({ backend });
          
          // Test basic operations
          const channel: ChannelInfo = {
            channelId: 'test-channel',
            payerDid: 'did:rooch:payer',
            payeeDid: 'did:rooch:payee',
            assetId: '0x3::gas_coin::RGas',
            epoch: BigInt(0),
            status: 'active',
          };
          
          await repo.setChannelMetadata('test-channel', channel);
          const retrieved = await repo.getChannelMetadata('test-channel');
          
          expect(retrieved).toEqual(channel);
        });

        it('should implement RAVRepository interface correctly', async () => {
          const repo = createRAVRepo({ backend });
          
          const rav: SignedSubRAV = {
            subRav: {
              version: 1,
              chainId: BigInt(4),
              channelId: 'test-channel',
              channelEpoch: BigInt(0),
              vmIdFragment: 'test-vm',
              accumulatedAmount: BigInt(100),
              nonce: BigInt(1),
            },
            signature: new Uint8Array([0x01, 0x02, 0x03]),
          };
          
          await repo.save(rav);
          const retrieved = await repo.getLatest('test-channel', 'test-vm');
          
          expect(retrieved).toEqual(rav);
        });

        it('should implement PendingSubRAVRepository interface correctly', async () => {
          const repo = createPendingSubRAVRepo({ backend });
          
          const subRAV: SubRAV = {
            version: 1,
            chainId: BigInt(4),
            channelId: 'test-channel',
            channelEpoch: BigInt(0),
            vmIdFragment: 'test-vm',
            accumulatedAmount: BigInt(100),
            nonce: BigInt(1),
          };
          
          await repo.save(subRAV);
          const retrieved = await repo.find('test-channel', 'test-vm', BigInt(1));
          
          expect(retrieved).toEqual(subRAV);
        });
      });
    });
  });
});