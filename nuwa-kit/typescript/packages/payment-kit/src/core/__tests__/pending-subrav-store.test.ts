/**
 * Unit tests for PendingSubRAVRepository implementations
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { MemoryPendingSubRAVRepository } from '../../storage/memory/pendingSubRav.memory';
import type { SubRAV } from '../types';

describe('PendingSubRAVRepository Memory Implementation', () => {
  let store: MemoryPendingSubRAVRepository;

  beforeEach(() => {
    store = new MemoryPendingSubRAVRepository();
  });

  test('should save and find pending SubRAV', async () => {
    const subRAV: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'test-channel',
      channelEpoch: BigInt(1),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(100),
      nonce: BigInt(1)
    };

    await store.save(subRAV);

    const found = await store.find('test-channel', BigInt(1));
    expect(found).toBeDefined();
    expect(found?.channelId).toBe('test-channel');
    expect(found?.nonce).toBe(BigInt(1));
    expect(found?.accumulatedAmount).toBe(BigInt(100));
  });

  test('should return null for non-existent SubRAV', async () => {
    const found = await store.find('non-existent', BigInt(1));
    expect(found).toBeNull();
  });

  test('should remove pending SubRAV', async () => {
    const subRAV: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'test-channel',
      channelEpoch: BigInt(1),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(100),
      nonce: BigInt(1)
    };

    await store.save(subRAV);
    
    // Verify it exists
    let found = await store.find('test-channel', BigInt(1));
    expect(found).toBeDefined();

    // Remove it
    await store.remove('test-channel', BigInt(1));

    // Verify it's gone
    found = await store.find('test-channel', BigInt(1));
    expect(found).toBeNull();
  });

  test('should cleanup expired SubRAVs', async () => {
    const subRAV1: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'channel-1',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      accumulatedAmount: BigInt(100),
      nonce: BigInt(1)
    };

    const subRAV2: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'channel-2',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      accumulatedAmount: BigInt(200),
      nonce: BigInt(1)
    };

    await store.save(subRAV1);
    await store.save(subRAV2);

    // Manually set old timestamp for one of them
    (store as any).proposals.set('channel-1:1', {
      subRAV: subRAV1,
      timestamp: Date.now() - (35 * 60 * 1000) // 35 minutes ago
    });

    // Cleanup expired (older than 30 minutes)
    const cleanedCount = await store.cleanup(30 * 60 * 1000);

    expect(cleanedCount).toBe(1);

    // Verify only the new one remains
    const found1 = await store.find('channel-1', BigInt(1));
    const found2 = await store.find('channel-2', BigInt(1));
    expect(found1).toBeNull();
    expect(found2).toBeDefined();
  });

  test('should provide statistics', async () => {
    const subRAV1: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'channel-1',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      accumulatedAmount: BigInt(100),
      nonce: BigInt(1)
    };

    const subRAV2: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'channel-1',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      accumulatedAmount: BigInt(200),
      nonce: BigInt(2)
    };

    const subRAV3: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'channel-2',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      accumulatedAmount: BigInt(150),
      nonce: BigInt(1)
    };

    await store.save(subRAV1);
    await store.save(subRAV2);
    await store.save(subRAV3);

    const stats = await store.getStats();

    expect(stats.totalCount).toBe(3);
    expect(stats.byChannel['channel-1']).toBe(2);
    expect(stats.byChannel['channel-2']).toBe(1);
    expect(stats.oldestTimestamp).toBeDefined();
    expect(stats.newestTimestamp).toBeDefined();
  });

  test('should clear all pending SubRAVs', async () => {
    const subRAV: SubRAV = {
      version: 1,
      chainId: BigInt(1),
      channelId: 'test-channel',
      channelEpoch: BigInt(1),
      vmIdFragment: 'test-key',
      accumulatedAmount: BigInt(100),
      nonce: BigInt(1)
    };

    await store.save(subRAV);

    let stats = await store.getStats();
    expect(stats.totalCount).toBe(1);

    await store.clear();

    stats = await store.getStats();
    expect(stats.totalCount).toBe(0);
  });
});
