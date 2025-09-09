import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalStorageHostChannelMappingStore } from '../LocalStore';
import type { PersistedHttpClientState } from '../../../../schema/core';
import { HttpPaymentCodec } from '../../../../middlewares/http/HttpPaymentCodec';
import { SubRAV } from '../../../../core/types';
import { parseJson, serializeJson } from '../../../../utils/json';

class MemoryLocalStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

const installLocalStorage = () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryLocalStorage(),
    configurable: true,
    writable: false,
  });
};

const uninstallLocalStorage = () => {
  Reflect.deleteProperty(globalThis, 'localStorage');
};

describe('LocalStorageHostChannelMappingStore', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
  });

  test('getState returns undefined when not set', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    await expect(store.getState('api.example.com')).resolves.toBeUndefined();
  });

  test('setState and getState round-trip', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    const state: PersistedHttpClientState = {
      channelId: 'ch-123',
    };

    await store.setState('api.example.com', state);
    const loaded = await store.getState('api.example.com');

    expect(loaded).toBeDefined();
    expect(loaded!.channelId).toBe('ch-123');
    expect(typeof loaded!.lastUpdated).toBe('string');
    expect(Number.isNaN(Date.parse(loaded!.lastUpdated!))).toBe(false);
  });

  test('getState returns undefined when stored data is invalid JSON or invalid schema', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    await store.setState('api.example.com', { channelId: 'abc' });

    // Corrupt the stored value directly
    const ls = Reflect.get(globalThis, 'localStorage') as Storage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    // There should be exactly one namespaced key created by setState
    expect(keys.length).toBe(1);
    ls.setItem(keys[0], '{ this is not json }');

    const result = await store.getState('api.example.com');
    expect(result).toBeUndefined();
  });

  test('deleteState removes persisted entry', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    await store.setState('api.example.com', { channelId: 'to-delete' });
    await store.deleteState('api.example.com');
    const res = await store.getState('api.example.com');
    expect(res).toBeUndefined();
  });

  test('clear removes only namespaced keys', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    await store.setState('a.example.com', { channelId: 'a' });
    await store.setState('b.example.com', { channelId: 'b' });

    // Add unrelated key
    const ls = Reflect.get(globalThis, 'localStorage') as Storage;
    ls.setItem('unrelated', '1');

    await store.clear();

    // Unrelated should still exist
    const ls2 = Reflect.get(globalThis, 'localStorage') as Storage;
    expect(ls2.getItem('unrelated')).toBe('1');

    // Namespaced entries should be gone
    await expect(store.getState('a.example.com')).resolves.toBeUndefined();
    await expect(store.getState('b.example.com')).resolves.toBeUndefined();
  });

  test('throws when localStorage is not available', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    uninstallLocalStorage();
    await expect(store.getState('api.example.com')).rejects.toThrow(
      'localStorage is not available'
    );
    await expect(store.setState('api.example.com', { channelId: 'x' })).rejects.toThrow(
      'localStorage is not available'
    );
    await expect(store.deleteState('api.example.com')).rejects.toThrow(
      'localStorage is not available'
    );
    await expect(store.clear()).rejects.toThrow('localStorage is not available');
  });

  test('getState converts legacy pendingSubRAV (SubRAV) to SerializableSubRAV', async () => {
    const store = new LocalStorageHostChannelMappingStore();
    const host = 'api.example.com';

    // Prepare legacy persisted value with bigint SubRAV
    const subRav: SubRAV = {
      version: 1,
      chainId: BigInt(4),
      channelId: 'ch-123',
      channelEpoch: BigInt(1),
      vmIdFragment: 'key-1',
      nonce: BigInt(5),
      accumulatedAmount: BigInt(100),
    };
    const fixedTs = '2024-01-01T00:00:00.000Z';
    const legacyState = {
      channelId: 'ch-123',
      pendingSubRAV: subRav,
      lastUpdated: fixedTs,
    } satisfies any;

    // Seed a valid key first, then overwrite with legacy JSON to avoid guessing the prefix
    await store.setState(host, { channelId: 'seed' });
    const ls = Reflect.get(globalThis, 'localStorage') as Storage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.includes(host)) keys.push(k);
    }
    expect(keys.length).toBe(1);
    ls.setItem(keys[0], serializeJson(legacyState));

    const loaded = await store.getState(host);
    expect(loaded).toBeDefined();
    expect(loaded!.channelId).toBe('ch-123');
    expect(loaded!.lastUpdated).toBe(fixedTs);

    const expectedPending = HttpPaymentCodec.serializeSubRAV(subRav);
    expect(loaded!.pendingSubRAV).toEqual(expectedPending);
  });
});
