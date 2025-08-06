import type { HostChannelMappingStore, PersistedHttpClientState } from '../types';

/**
 * Memory-based implementation of HostChannelMappingStore
 * Suitable for short-lived processes or testing
 */
export class MemoryHostChannelMappingStore implements HostChannelMappingStore {
  private store = new Map<string, string>();
  private stateStore = new Map<string, PersistedHttpClientState>();

  // Legacy methods for backward compatibility
  async get(host: string): Promise<string | undefined> {
    return this.store.get(host);
  }

  async set(host: string, channelId: string): Promise<void> {
    this.store.set(host, channelId);
  }

  async delete(host: string): Promise<void> {
    this.store.delete(host);
    this.stateStore.delete(host);
  }

  // New methods for full state management
  async getState(host: string): Promise<PersistedHttpClientState | undefined> {
    return this.stateStore.get(host);
  }

  async setState(host: string, state: PersistedHttpClientState): Promise<void> {
    this.stateStore.set(host, state);
    // Keep legacy store in sync
    if (state.channelId) {
      this.store.set(host, state.channelId);
    }
  }

  async deleteState(host: string): Promise<void> {
    this.stateStore.delete(host);
    this.store.delete(host);
  }

  /**
   * Clear all stored mappings and states
   */
  clear(): void {
    this.store.clear();
    this.stateStore.clear();
  }
}

/**
 * LocalStorage-based implementation for browsers
 * Provides persistence across browser sessions
 */
export class LocalStorageHostChannelMappingStore implements HostChannelMappingStore {
  private static readonly CHANNEL_PREFIX = 'nuwa-payment-channel-mapping:';
  private static readonly STATE_PREFIX = 'nuwa-payment-client-state:';

  // Legacy methods for backward compatibility
  async get(host: string): Promise<string | undefined> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const key = LocalStorageHostChannelMappingStore.CHANNEL_PREFIX + host;
    const value = localStorage.getItem(key);
    return value || undefined;
  }

  async set(host: string, channelId: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const key = LocalStorageHostChannelMappingStore.CHANNEL_PREFIX + host;
    localStorage.setItem(key, channelId);
  }

  async delete(host: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const channelKey = LocalStorageHostChannelMappingStore.CHANNEL_PREFIX + host;
    const stateKey = LocalStorageHostChannelMappingStore.STATE_PREFIX + host;
    localStorage.removeItem(channelKey);
    localStorage.removeItem(stateKey);
  }

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
      const parsed = JSON.parse(value) as any;
      
      // Fix BigInt deserialization for pendingSubRAV
      if (parsed.pendingSubRAV) {
        parsed.pendingSubRAV = {
          ...parsed.pendingSubRAV,
          chainId: BigInt(parsed.pendingSubRAV.chainId),
          channelEpoch: BigInt(parsed.pendingSubRAV.channelEpoch),
          accumulatedAmount: BigInt(parsed.pendingSubRAV.accumulatedAmount),
          nonce: BigInt(parsed.pendingSubRAV.nonce)
        };
      }
      
      return parsed as PersistedHttpClientState;
    } catch (error) {
      console.warn('Failed to parse stored client state:', error);
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
      lastUpdated: new Date().toISOString()
    };
    
    // Use JSON.stringify with BigInt replacer for proper serialization
    const serializedState = JSON.stringify(stateWithTimestamp, (key, value) => {
      return typeof value === 'bigint' ? value.toString() : value;
    });
    
    localStorage.setItem(stateKey, serializedState);
    
    // Keep legacy store in sync
    if (state.channelId) {
      const channelKey = LocalStorageHostChannelMappingStore.CHANNEL_PREFIX + host;
      localStorage.setItem(channelKey, state.channelId);
    }
  }

  async deleteState(host: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const channelKey = LocalStorageHostChannelMappingStore.CHANNEL_PREFIX + host;
    const stateKey = LocalStorageHostChannelMappingStore.STATE_PREFIX + host;
    localStorage.removeItem(channelKey);
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
      if (key && (
        key.startsWith(LocalStorageHostChannelMappingStore.CHANNEL_PREFIX) ||
        key.startsWith(LocalStorageHostChannelMappingStore.STATE_PREFIX)
      )) {
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