/**
 * Extended Channel State Storage Interface
 * 
 * Extends the basic ChannelStateStorage from storage.ts with advanced features
 * like statistics, listing, and removal operations.
 */

import type { ChannelMetadata, SubChannelState } from '../core/types';
import type { ChannelStateStorage as BaseChannelStateStorage } from './BaseStorage';

/**
 * Storage options for different storage backends
 */
export interface StorageOptions {
  /** Storage type selection */
  type?: 'memory' | 'indexeddb' | 'sql' | 'custom';
  /** Database connection string for SQL backends */
  connectionString?: string;
  /** Custom storage implementation */
  customStorage?: ChannelStateStorage;
  /** TTL for cached data (in milliseconds) */
  ttl?: number;
}

/**
 * Extended Channel State Storage interface
 * 
 * Extends the base interface with additional management and monitoring features
 */
export interface ChannelStateStorage extends BaseChannelStateStorage {
  // -------- Extended Channel Metadata Operations --------
  
  /**
   * List all cached channel metadata
   */
  listChannelMetadata(): Promise<ChannelMetadata[]>;

  /**
   * Remove channel metadata
   */
  removeChannelMetadata(channelId: string): Promise<void>;

  // -------- Extended Sub-Channel State Operations --------

  /**
   * List all sub-channel states for a channel
   */
  listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>>;

  /**
   * Remove sub-channel state
   */
  removeSubChannelState(keyId: string): Promise<void>;

  // -------- Advanced Cache Management --------

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  /** Number of cached channels */
  channelCount: number;
  /** Number of cached sub-channel states */
  subChannelCount: number;
  /** Cache hit rate (0-1) */
  hitRate?: number;
  /** Total cache size in bytes (approximate) */
  sizeBytes?: number;
}

/**
 * Memory-based implementation of Extended ChannelStateStorage
 */
export class MemoryChannelStateStorage implements ChannelStateStorage {
  private channelMetadata = new Map<string, ChannelMetadata>();
  private subChannelStates = new Map<string, SubChannelState>();
  private hitCount = 0;
  private missCount = 0;

  // -------- Base ChannelStateCache Implementation --------

  async getChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
    const result = this.channelMetadata.get(channelId) || null;
    if (result) {
      this.hitCount++;
    } else {
      this.missCount++;
    }
    return result;
  }

  async setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void> {
    this.channelMetadata.set(channelId, { ...metadata });
  }

  async getSubChannelState(keyId: string): Promise<SubChannelState> {
    const existing = this.subChannelStates.get(keyId);
    if (existing) {
      this.hitCount++;
      return { ...existing };
    }

    this.missCount++;
    // Return default state if not found
    const defaultState: SubChannelState = {
      channelId: 'default',
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    };
    
    // Cache the default state
    await this.updateSubChannelState(keyId, defaultState);
    return defaultState;
  }

  async updateSubChannelState(keyId: string, updates: Partial<SubChannelState>): Promise<void> {
    const existing = this.subChannelStates.get(keyId);
    const updated: SubChannelState = {
      channelId: updates.channelId || existing?.channelId || 'default',
      epoch: updates.epoch ?? existing?.epoch ?? BigInt(0),
      accumulatedAmount: updates.accumulatedAmount ?? existing?.accumulatedAmount ?? BigInt(0),
      nonce: updates.nonce ?? existing?.nonce ?? BigInt(0),
      lastUpdated: updates.lastUpdated || Date.now(),
    };
    
    this.subChannelStates.set(keyId, updated);
  }

  async clear(): Promise<void> {
    this.channelMetadata.clear();
    this.subChannelStates.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  // -------- Extended Operations --------

  async listChannelMetadata(): Promise<ChannelMetadata[]> {
    return Array.from(this.channelMetadata.values());
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    this.channelMetadata.delete(channelId);
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    const result: Record<string, SubChannelState> = {};
    for (const [keyId, state] of this.subChannelStates.entries()) {
      if (state.channelId === channelId) {
        result[keyId] = { ...state };
      }
    }
    return result;
  }

  async removeSubChannelState(keyId: string): Promise<void> {
    this.subChannelStates.delete(keyId);
  }

  async getStats(): Promise<CacheStats> {
    const totalRequests = this.hitCount + this.missCount;
    return {
      channelCount: this.channelMetadata.size,
      subChannelCount: this.subChannelStates.size,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      sizeBytes: this.estimateSize(),
    };
  }

  private estimateSize(): number {
    // Rough estimation of memory usage
    let size = 0;
    for (const metadata of this.channelMetadata.values()) {
      size += JSON.stringify(metadata).length * 2; // Rough UTF-16 estimation
    }
    for (const state of this.subChannelStates.values()) {
      size += JSON.stringify(state).length * 2;
    }
    return size;
  }
}

/**
 * IndexedDB-based implementation of Extended ChannelStateStorage
 */
export class IndexedDBChannelStateStorage implements ChannelStateStorage {
  private dbName = 'nuwa-payment-kit-cache';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('channels')) {
          db.createObjectStore('channels', { keyPath: 'channelId' });
        }
        
        if (!db.objectStoreNames.contains('subChannels')) {
          db.createObjectStore('subChannels', { keyPath: 'keyId' });
        }
      };
    });
  }

  // -------- Base ChannelStateCache Implementation --------

  async getChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readonly');
    const store = tx.objectStore('channels');
    
    return new Promise((resolve, reject) => {
      const request = store.get(channelId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readwrite');
    const store = tx.objectStore('channels');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSubChannelState(keyId: string): Promise<SubChannelState> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannels'], 'readonly');
    const store = tx.objectStore('subChannels');
    
    const result = await new Promise<SubChannelState | null>((resolve, reject) => {
      const request = store.get(keyId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    
    return result || {
      channelId: '',
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    };
  }

  async updateSubChannelState(keyId: string, updates: Partial<SubChannelState>): Promise<void> {
    const current = await this.getSubChannelState(keyId);
    const updated = {
      ...current,
      ...updates,
      keyId,
      lastUpdated: Date.now(),
    };
    
    const db = await this.getDB();
    const tx = db.transaction(['subChannels'], 'readwrite');
    const store = tx.objectStore('subChannels');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(updated);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['channels', 'subChannels'], 'readwrite');
    
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('channels').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('subChannels').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);
  }

  // -------- Extended Operations --------

  async listChannelMetadata(): Promise<ChannelMetadata[]> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readonly');
    const store = tx.objectStore('channels');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readwrite');
    const store = tx.objectStore('channels');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(channelId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannels'], 'readonly');
    const store = tx.objectStore('subChannels');
    
    const allStates = await new Promise<SubChannelState[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const result: Record<string, SubChannelState> = {};
    for (const state of allStates) {
      if (state.channelId === channelId) {
        // keyId should be stored in the object or derived from the key
        const keyId = (state as any).keyId || 'unknown';
        result[keyId] = state;
      }
    }
    
    return result;
  }

  async removeSubChannelState(keyId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannels'], 'readwrite');
    const store = tx.objectStore('subChannels');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(keyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStats(): Promise<CacheStats> {
    const channels = await this.listChannelMetadata();
    const db = await this.getDB();
    const tx = db.transaction(['subChannels'], 'readonly');
    const store = tx.objectStore('subChannels');
    
    const subChannelCount = await new Promise<number>((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    return {
      channelCount: channels.length,
      subChannelCount,
      hitRate: undefined, // IndexedDB doesn't track hit rates
      sizeBytes: undefined, // Difficult to estimate without additional metadata
    };
  }
}

/**
 * SQL-based implementation of Extended ChannelStateStorage (PLACEHOLDER)
 * TODO: Implement full SQL storage with PostgreSQL/SQLite support
 */
export class SQLChannelStateStorage implements ChannelStateStorage {
  constructor(private connectionString: string) {
    // TODO: Initialize database connection
  }

  async getChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
    throw new Error('TODO: Implement SQL storage for channel metadata');
  }

  async setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void> {
    throw new Error('TODO: Implement SQL storage for channel metadata');
  }

  async getSubChannelState(keyId: string): Promise<SubChannelState> {
    throw new Error('TODO: Implement SQL storage for sub-channel state');
  }

  async updateSubChannelState(keyId: string, updates: Partial<SubChannelState>): Promise<void> {
    throw new Error('TODO: Implement SQL storage for sub-channel state');
  }

  async clear(): Promise<void> {
    throw new Error('TODO: Implement SQL storage clear operation');
  }

  async listChannelMetadata(): Promise<ChannelMetadata[]> {
    throw new Error('TODO: Implement SQL storage for listing channels');
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    throw new Error('TODO: Implement SQL storage for removing channels');
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    throw new Error('TODO: Implement SQL storage for listing sub-channels');
  }

  async removeSubChannelState(keyId: string): Promise<void> {
    throw new Error('TODO: Implement SQL storage for removing sub-channels');
  }

  async getStats(): Promise<CacheStats> {
    throw new Error('TODO: Implement SQL storage stats');
  }
}