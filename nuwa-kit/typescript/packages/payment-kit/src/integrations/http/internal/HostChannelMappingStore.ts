import type { HostChannelMappingStore } from '../types';

/**
 * Memory-based implementation of HostChannelMappingStore
 * Suitable for short-lived processes or testing
 */
export class MemoryHostChannelMappingStore implements HostChannelMappingStore {
  private store = new Map<string, string>();

  async get(host: string): Promise<string | undefined> {
    return this.store.get(host);
  }

  async set(host: string, channelId: string): Promise<void> {
    this.store.set(host, channelId);
  }

  async delete(host: string): Promise<void> {
    this.store.delete(host);
  }

  /**
   * Clear all stored mappings
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * LocalStorage-based implementation for browsers
 * Provides persistence across browser sessions
 */
export class LocalStorageHostChannelMappingStore implements HostChannelMappingStore {
  private static readonly PREFIX = 'nuwa-payment-channel-mapping:';

  async get(host: string): Promise<string | undefined> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const key = LocalStorageHostChannelMappingStore.PREFIX + host;
    const value = localStorage.getItem(key);
    return value || undefined;
  }

  async set(host: string, channelId: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const key = LocalStorageHostChannelMappingStore.PREFIX + host;
    localStorage.setItem(key, channelId);
  }

  async delete(host: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const key = LocalStorageHostChannelMappingStore.PREFIX + host;
    localStorage.removeItem(key);
  }

  /**
   * Clear all stored mappings
   */
  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LocalStorageHostChannelMappingStore.PREFIX)) {
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