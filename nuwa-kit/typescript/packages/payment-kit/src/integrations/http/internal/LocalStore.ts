import type { HostChannelMappingStore, PersistedHttpClientState } from '../types';
import { PersistedHttpClientStateSchema } from '../../../schema/core';
import { serializeJson, parseJson } from '../../../utils/json';
import {
  ChannelRepository,
  IndexedDBChannelRepository,
  MemoryChannelRepository,
  MemoryTransactionStore,
  TransactionStore,
  IndexedDBTransactionStore,
} from '../../../storage';

/**
 * Memory-based implementation of HostChannelMappingStore
 * Suitable for short-lived processes or testing
 */
export class MemoryHostChannelMappingStore implements HostChannelMappingStore {
  private stateStore = new Map<string, PersistedHttpClientState>();

  // New methods for full state management
  async getState(host: string): Promise<PersistedHttpClientState | undefined> {
    return this.stateStore.get(host);
  }

  async setState(host: string, state: PersistedHttpClientState): Promise<void> {
    // Validate with Zod schema to ensure data integrity
    const validatedState = PersistedHttpClientStateSchema.parse(state);

    this.stateStore.set(host, validatedState);
  }

  async deleteState(host: string): Promise<void> {
    this.stateStore.delete(host);
  }

  /**
   * Clear all stored mappings and states
   */
  clear(): void {
    this.stateStore.clear();
  }
}

/**
 * LocalStorage-based implementation for browsers
 * Provides persistence across browser sessions
 */
export class LocalStorageHostChannelMappingStore implements HostChannelMappingStore {
  private static readonly STATE_PREFIX = 'nuwa-payment-client-state:';

  // New methods for full state management
  async getState(host: string): Promise<PersistedHttpClientState | undefined> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    const key = LocalStorageHostChannelMappingStore.STATE_PREFIX + host;
    const value = localStorage.getItem(key);

    if (!value) {
      return undefined;
    }

    try {
      // Parse JSON with lossless-json first
      const parsedData = parseJson(value) as any;

      // Backward compatibility: pendingSubRAV used to be stored as SubRAV (bigint/number fields)
      // Convert legacy structure to SerializableSubRAV (string fields) before validation
      if (parsedData && typeof parsedData === 'object' && parsedData.pendingSubRAV) {
        const p = parsedData.pendingSubRAV as any;
        const looksLegacy = typeof p.version === 'number' || typeof p.chainId !== 'string';
        if (looksLegacy) {
          parsedData.pendingSubRAV = {
            version: String(p.version),
            chainId: String(p.chainId),
            channelId: String(p.channelId),
            channelEpoch: String(p.channelEpoch),
            vmIdFragment: String(p.vmIdFragment),
            accumulatedAmount: String(p.accumulatedAmount),
            nonce: String(p.nonce),
          };
        }
      }

      // Then validate and transform with Zod (ensures structure is correct)
      return PersistedHttpClientStateSchema.parse(parsedData);
    } catch (error) {
      return undefined;
    }
  }

  async setState(host: string, state: PersistedHttpClientState): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    const stateKey = LocalStorageHostChannelMappingStore.STATE_PREFIX + host;
    const stateWithTimestamp = {
      ...state,
      lastUpdated: new Date().toISOString(),
    };

    // Validate and transform with Zod (ensures proper structure)
    const validatedState = PersistedHttpClientStateSchema.parse(stateWithTimestamp);

    // Use lossless-json for proper BigInt serialization
    const serializedState = serializeJson(validatedState);

    localStorage.setItem(stateKey, serializedState);

    // channelId is part of state; no separate legacy mapping kept
  }

  async deleteState(host: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    const stateKey = LocalStorageHostChannelMappingStore.STATE_PREFIX + host;
    localStorage.removeItem(stateKey);
  }

  /**
   * Clear all stored mappings and states
   */
  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LocalStorageHostChannelMappingStore.STATE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

/**
 * Auto-detect environment and create appropriate mapping store
 */
export function createDefaultMappingStore(): HostChannelMappingStore {
  // Check if we're in a browser environment with localStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    return new LocalStorageHostChannelMappingStore();
  }

  // Fall back to memory store for Node.js or environments without localStorage
  return new MemoryHostChannelMappingStore();
}

export function createDefaultChannelRepo(): ChannelRepository {
  if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    return new IndexedDBChannelRepository();
  }
  return new MemoryChannelRepository();
}

export function createDefaultTransactionStore(): TransactionStore {
  if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    return new IndexedDBTransactionStore();
  }
  return new MemoryTransactionStore();
}

/**
 * Extract host from URL string
 */
export function extractHost(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.host; // includes port if present
  } catch (error) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

// ==================== Namespaced Host Mapping Store ====================

export interface NamespaceProviders {
  /** Resolve payer DID (async) */
  getPayerDid: () => Promise<string>;
}

/**
 * A wrapper around HostChannelMappingStore adding DID/network namespacing to keys.
 * Composite key format: `${host}::${payerDid}`
 */
export class NamespacedHostChannelMappingStore implements HostChannelMappingStore {
  constructor(
    private readonly base: HostChannelMappingStore,
    private readonly providers: NamespaceProviders
  ) {}

  private async buildKey(host: string): Promise<string> {
    const payerDid = await this.providers.getPayerDid();
    const ns = [host, payerDid].join('::');
    return ns;
  }

  async getState(host: string): Promise<PersistedHttpClientState | undefined> {
    const key = await this.buildKey(host);
    return this.base.getState(key);
  }

  async setState(host: string, state: PersistedHttpClientState): Promise<void> {
    const key = await this.buildKey(host);
    return this.base.setState(key, state);
  }

  async deleteState(host: string): Promise<void> {
    const key = await this.buildKey(host);
    return this.base.deleteState(key);
  }
}

export function createNamespacedMappingStore(
  base: HostChannelMappingStore,
  providers: NamespaceProviders
): HostChannelMappingStore {
  return new NamespacedHostChannelMappingStore(base, providers);
}
