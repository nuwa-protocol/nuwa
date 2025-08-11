/**
 * Test BigInt serialization in HostChannelMappingStore
 */

import { MemoryHostChannelMappingStore } from '../integrations/http/internal/LocalStore';
import type { PersistedHttpClientState } from '../schema/core';

describe('BigInt Serialization in HostChannelMappingStore', () => {
  let store: MemoryHostChannelMappingStore;

  beforeEach(() => {
    store = new MemoryHostChannelMappingStore();
  });

  test('should correctly serialize and deserialize BigInt values in PersistedHttpClientState', async () => {
    // 创建包含 BigInt 的测试数据
    const testState: PersistedHttpClientState = {
      channelId: 'test-channel-123',
      pendingSubRAV: {
        version: 1,
        chainId: 4n, // BigInt
        channelId: 'test-channel-123',
        channelEpoch: 0n, // BigInt
        vmIdFragment: 'account-key',
        accumulatedAmount: 1000000000n, // BigInt - 1 RGas
        nonce: 5n // BigInt
      },
      lastUpdated: new Date().toISOString()
    };

    const host = 'test.example.com';

    // 保存状态 - 这里会触发 Zod 验证
    await store.setState(host, testState);

    // 读取状态
    const retrievedState = await store.getState(host);

    // 验证基本结构
    expect(retrievedState).toBeDefined();
    expect(retrievedState!.channelId).toBe(testState.channelId);
    expect(retrievedState!.pendingSubRAV).toBeDefined();

    const originalSubRAV = testState.pendingSubRAV!;
    const retrievedSubRAV = retrievedState!.pendingSubRAV!;

    // 验证 BigInt 字段的类型和值
    expect(typeof retrievedSubRAV.chainId).toBe('bigint');
    expect(retrievedSubRAV.chainId).toBe(originalSubRAV.chainId);

    expect(typeof retrievedSubRAV.channelEpoch).toBe('bigint');
    expect(retrievedSubRAV.channelEpoch).toBe(originalSubRAV.channelEpoch);

    expect(typeof retrievedSubRAV.accumulatedAmount).toBe('bigint');
    expect(retrievedSubRAV.accumulatedAmount).toBe(originalSubRAV.accumulatedAmount);

    expect(typeof retrievedSubRAV.nonce).toBe('bigint');
    expect(retrievedSubRAV.nonce).toBe(originalSubRAV.nonce);

    // 验证其他字段
    expect(retrievedSubRAV.version).toBe(originalSubRAV.version);
    expect(retrievedSubRAV.channelId).toBe(originalSubRAV.channelId);
    expect(retrievedSubRAV.vmIdFragment).toBe(originalSubRAV.vmIdFragment);
  });

  test('should handle states without pendingSubRAV', async () => {
    const testState: PersistedHttpClientState = {
      channelId: 'test-channel-456',
      lastUpdated: new Date().toISOString()
    };

    const host = 'test2.example.com';

    await store.setState(host, testState);
    const retrievedState = await store.getState(host);

    expect(retrievedState).toBeDefined();
    expect(retrievedState!.channelId).toBe(testState.channelId);
    expect(retrievedState!.pendingSubRAV).toBeUndefined();
  });

  test('should validate data with Zod schema', async () => {
    const invalidState = {
      channelId: 'test-channel',
      pendingSubRAV: {
        version: 1,
        // 缺少必需的 BigInt 字段
        channelId: 'test-channel',
        vmIdFragment: 'account-key',
      },
    } as any;

    const host = 'invalid.example.com';

    // 应该抛出 Zod 验证错误
    await expect(store.setState(host, invalidState)).rejects.toThrow();
  });

  test('should maintain legacy store sync', async () => {
    const testState: PersistedHttpClientState = {
      channelId: 'legacy-channel-789',
    };

    const host = 'legacy.example.com';

    await store.setState(host, testState);
    
    // 验证 legacy get 方法也能获取到 channelId
    const legacyChannelId = await store.get(host);
    expect(legacyChannelId).toBe(testState.channelId);
  });
});