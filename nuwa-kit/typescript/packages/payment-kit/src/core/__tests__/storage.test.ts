/**
 * Tests for storage layer implementations
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { MemoryRAVStore, MemoryChannelStateCache } from '../storage';
import type { SignedSubRAV, SubChannelState, ChannelMetadata } from '../types';

describe('MemoryRAVStore', () => {
  let store: MemoryRAVStore;
  
  const sampleRAV: SignedSubRAV = {
    subRav: {
      version: 1,
      chainId: BigInt(4),
      channelId: '0x1234567890abcdef1234567890abcdef12345678',
      channelEpoch: BigInt(0),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(1000),
      nonce: BigInt(1),
    },
    signature: new Uint8Array([1, 2, 3, 4, 5]),
  };

  beforeEach(() => {
    store = new MemoryRAVStore();
  });

  test('should save and retrieve RAV', async () => {
    await store.save(sampleRAV);
    
    const retrieved = await store.getLatest(
      sampleRAV.subRav.channelId,
      sampleRAV.subRav.vmIdFragment
    );
    
    expect(retrieved).toEqual(sampleRAV);
  });

  test('should handle multiple RAVs with increasing nonce', async () => {
    const rav1 = { ...sampleRAV };
    const rav2 = {
      ...sampleRAV,
      subRav: { ...sampleRAV.subRav, nonce: BigInt(2), accumulatedAmount: BigInt(2000) },
    };

    await store.save(rav1);
    await store.save(rav2);

    const latest = await store.getLatest(
      sampleRAV.subRav.channelId,
      sampleRAV.subRav.vmIdFragment
    );

    expect(latest?.subRav.nonce).toBe(BigInt(2));
    expect(latest?.subRav.accumulatedAmount).toBe(BigInt(2000));
  });

  test('should prevent duplicate RAVs with same nonce', async () => {
    await store.save(sampleRAV);
    await store.save(sampleRAV); // Duplicate

    const ravs: SignedSubRAV[] = [];
    for await (const rav of store.list(sampleRAV.subRav.channelId)) {
      ravs.push(rav);
    }

    expect(ravs).toHaveLength(1);
  });

  test('should list all RAVs for a channel', async () => {
    const rav1 = { ...sampleRAV, subRav: { ...sampleRAV.subRav, vmIdFragment: 'key1' } };
    const rav2 = { ...sampleRAV, subRav: { ...sampleRAV.subRav, vmIdFragment: 'key2' } };

    await store.save(rav1);
    await store.save(rav2);

    const ravs: SignedSubRAV[] = [];
    for await (const rav of store.list(sampleRAV.subRav.channelId)) {
      ravs.push(rav);
    }

    expect(ravs).toHaveLength(2);
    expect(ravs.some(r => r.subRav.vmIdFragment === 'key1')).toBe(true);
    expect(ravs.some(r => r.subRav.vmIdFragment === 'key2')).toBe(true);
  });

  test('should track unclaimed RAVs', async () => {
    await store.save(sampleRAV);
    
    const unclaimed = await store.getUnclaimedRAVs(sampleRAV.subRav.channelId);
    
    expect(unclaimed.size).toBe(1);
    expect(unclaimed.get('test-key')).toEqual(sampleRAV);
  });

  test('should mark RAVs as claimed', async () => {
    await store.save(sampleRAV);
    await store.markAsClaimed(
      sampleRAV.subRav.channelId,
      sampleRAV.subRav.vmIdFragment,
      sampleRAV.subRav.nonce
    );

    const unclaimed = await store.getUnclaimedRAVs(sampleRAV.subRav.channelId);
    expect(unclaimed.size).toBe(0);
  });
});

describe('MemoryChannelStateCache', () => {
  let cache: MemoryChannelStateCache;
  
  const sampleMetadata: ChannelMetadata = {
    channelId: '0x1234567890abcdef1234567890abcdef12345678',
    payerDid: 'did:rooch:0xabc...',
    payeeDid: 'did:rooch:0xdef...',
    asset: { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' },
    totalCollateral: BigInt(1000000),
    epoch: BigInt(0),
    status: 'active',
  };

  beforeEach(() => {
    cache = new MemoryChannelStateCache();
  });

  test('should store and retrieve channel metadata', async () => {
    await cache.setChannelMetadata(sampleMetadata.channelId, sampleMetadata);
    
    const retrieved = await cache.getChannelMetadata(sampleMetadata.channelId);
    expect(retrieved).toEqual(sampleMetadata);
  });

  test('should return null for non-existent channel', async () => {
    const retrieved = await cache.getChannelMetadata('non-existent');
    expect(retrieved).toBeNull();
  });

  test('should manage sub-channel state', async () => {
    const keyId = 'test-key-id';
    const updates: Partial<SubChannelState> = {
      channelId: sampleMetadata.channelId,
      epoch: BigInt(0),
      accumulatedAmount: BigInt(500),
      nonce: BigInt(1),
    };

    await cache.updateSubChannelState(keyId, updates);
    
    const state = await cache.getSubChannelState(keyId);
    expect(state.channelId).toBe(sampleMetadata.channelId);
    expect(state.accumulatedAmount).toBe(BigInt(500));
    expect(state.nonce).toBe(BigInt(1));
    expect(state.lastUpdated).toBeGreaterThan(0);
  });

  test('should return default state for new key', async () => {
    const state = await cache.getSubChannelState('new-key');
    
    expect(state.channelId).toBe('');
    expect(state.epoch).toBe(BigInt(0));
    expect(state.accumulatedAmount).toBe(BigInt(0));
    expect(state.nonce).toBe(BigInt(0));
  });

  test('should clear all cached data', async () => {
    await cache.setChannelMetadata(sampleMetadata.channelId, sampleMetadata);
    await cache.updateSubChannelState('test-key', { channelId: 'test' });

    await cache.clear();

    const metadata = await cache.getChannelMetadata(sampleMetadata.channelId);
    const state = await cache.getSubChannelState('test-key');

    expect(metadata).toBeNull();
    expect(state.channelId).toBe(''); // Default state
  });
}); 