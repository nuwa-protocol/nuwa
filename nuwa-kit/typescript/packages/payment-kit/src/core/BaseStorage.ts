/**
 * Storage layer interfaces and implementations for Payment Kit
 * Unified storage abstractions for both Payer and Payee workflows
 */

import type { SignedSubRAV, SubChannelState, ChannelInfo } from './types';

// ==================== Pagination and Filtering ====================

/**
 * Pagination parameters for listing operations
 */
export interface PaginationParams {
  /** Offset for pagination (number of items to skip) */
  offset?: number;
  /** Maximum number of items to return */
  limit?: number;
}

/**
 * Filter parameters for channel listing
 */
export interface ChannelFilter {
  /** Filter by payer DID */
  payerDid?: string;
  /** Filter by payee DID */
  payeeDid?: string;
  /** Filter by channel status */
  status?: 'active' | 'closing' | 'closed';
  /** Filter by asset ID */
  assetId?: string;
  /** Filter by creation time range */
  createdAfter?: number;
  createdBefore?: number;
}

/**
 * Result with pagination information
 */
export interface PaginatedResult<T> {
  /** The actual items */
  items: T[];
  /** Total number of items (for pagination UI) */
  totalCount: number;
  /** Whether there are more items */
  hasMore: boolean;
}

// ==================== RAV Store Interfaces ====================

/**
 * RAV storage interface for Payee (服务端收款方)
 * Responsible for persisting and retrieving SignedSubRAVs
 */
export interface RAVStore {
  /** Save a new RAV (idempotent operation) */
  save(rav: SignedSubRAV): Promise<void>;

  /** Get the latest RAV for a specific sub-channel */
  getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null>;

  /** List all RAVs for a channel (async iterator for pagination) */
  list(channelId: string): AsyncIterable<SignedSubRAV>;

  /** Get unclaimed RAVs grouped by sub-channel */
  getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>>;

  /** Mark RAVs as claimed up to specified nonce */
  markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void>;
}

// ==================== Channel State Storage Interfaces ====================

/**
 * Basic Channel State Storage interface
 * 
 * This minimal interface provides the essential caching operations needed for payment channels
 */
export interface ChannelStateStorage {
  // -------- Channel Metadata Operations --------
  
  /**
   * Get channel metadata by channel ID
   */
  getChannelMetadata(channelId: string): Promise<ChannelInfo | null>;
  
  /**
   * Set/update channel metadata
   */
  setChannelMetadata(channelId: string, metadata: ChannelInfo): Promise<void>;

  /**
   * Get sub-channel state for nonce and amount tracking
   * @param channelId - The channel ID to ensure no cross-channel key conflicts
   * @param keyId - Complete DID key ID (e.g., "did:rooch:address#account-key")
   */
  getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState>;
  
  /**
   * Update sub-channel state
   * @param channelId - The channel ID to ensure no cross-channel key conflicts
   * @param keyId - Complete DID key ID (e.g., "did:rooch:address#account-key")
   * @param updates - Partial updates to apply
   */
  updateSubChannelState(channelId: string, keyId: string, updates: Partial<SubChannelState>): Promise<void>;

  /** Clear all stored data */
  clear(): Promise<void>;
}

// ==================== Cache Layer Interfaces ====================

/**
 * True cache interface for temporary, performance-oriented data storage
 * This is a CACHE layer (temporary, lossy, with TTL) not a STORAGE layer (persistent, reliable)
 */
export interface ChannelStateCache {
  /** Get cached value by key */
  get<T>(key: string): Promise<T | null>;
  
  /** Set cached value with optional TTL */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  
  /** Clear all cached data */
  clear(): Promise<void>;
}

// ==================== RAV Store Implementations ====================

/**
 * Memory-based RAV store implementation (for testing)
 */
export class MemoryRAVStore implements RAVStore {
  private ravs = new Map<string, SignedSubRAV[]>();
  private claimedNonces = new Map<string, bigint>();

  private getKey(channelId: string, vmIdFragment: string): string {
    return `${channelId}:${vmIdFragment}`;
  }

  async save(rav: SignedSubRAV): Promise<void> {
    const key = this.getKey(rav.subRav.channelId, rav.subRav.vmIdFragment);
    
    if (!this.ravs.has(key)) {
      this.ravs.set(key, []);
    }
    
    const ravList = this.ravs.get(key)!;
    
    // Check if RAV with same nonce already exists (idempotent)
    const existing = ravList.find(r => r.subRav.nonce === rav.subRav.nonce);
    if (existing) {
      return; // Already exists
    }
    
    // Insert in sorted order by nonce
    ravList.push(rav);
    ravList.sort((a, b) => Number(a.subRav.nonce - b.subRav.nonce));
  }

  async getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    const key = this.getKey(channelId, vmIdFragment);
    const ravList = this.ravs.get(key);
    
    if (!ravList || ravList.length === 0) {
      return null;
    }
    
    return ravList[ravList.length - 1];
  }

  async *list(channelId: string): AsyncIterable<SignedSubRAV> {
    for (const [key, ravList] of this.ravs.entries()) {
      if (key.startsWith(channelId + ':')) {
        for (const rav of ravList) {
          yield rav;
        }
      }
    }
  }

  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    const result = new Map<string, SignedSubRAV>();
    
    for (const [key, ravList] of this.ravs.entries()) {
      if (key.startsWith(channelId + ':')) {
        const vmIdFragment = key.split(':')[1];
        const claimedNonce = this.claimedNonces.get(key) || BigInt(0);
        
        // Find the latest unclaimed RAV
        for (let i = ravList.length - 1; i >= 0; i--) {
          const rav = ravList[i];
          if (rav.subRav.nonce > claimedNonce) {
            result.set(vmIdFragment, rav);
            break;
          }
        }
      }
    }
    
    return result;
  }

  async markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void> {
    const key = this.getKey(channelId, vmIdFragment);
    this.claimedNonces.set(key, nonce);
  }
}

// ==================== Browser Storage Implementations ====================

/**
 * Browser IndexedDB-based RAV store implementation
 */
export class IndexedDBRAVStore implements RAVStore {
  private dbName = 'nuwa-payment-kit-ravs';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // RAVs store
        if (!db.objectStoreNames.contains('ravs')) {
          const store = db.createObjectStore('ravs', { 
            keyPath: ['channelId', 'vmIdFragment', 'nonce'] 
          });
          store.createIndex('channelId', 'channelId', { unique: false });
          store.createIndex('channel_vm', ['channelId', 'vmIdFragment'], { unique: false });
        }
        
        // Claims tracking store
        if (!db.objectStoreNames.contains('claims')) {
          db.createObjectStore('claims', { 
            keyPath: ['channelId', 'vmIdFragment'] 
          });
        }
      };
    });
  }

  async save(rav: SignedSubRAV): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['ravs'], 'readwrite');
    const store = tx.objectStore('ravs');
    
    const record = {
      channelId: rav.subRav.channelId,
      vmIdFragment: rav.subRav.vmIdFragment,
      nonce: rav.subRav.nonce.toString(),
      accumulatedAmount: rav.subRav.accumulatedAmount.toString(),
      ravData: rav,
      timestamp: Date.now(),
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    const db = await this.getDB();
    const tx = db.transaction(['ravs'], 'readonly');
    const store = tx.objectStore('ravs');
    const index = store.index('channel_vm');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(
        IDBKeyRange.only([channelId, vmIdFragment]),
        'prev' // Latest first
      );
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          resolve(cursor.value.ravData);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async *list(channelId: string): AsyncIterable<SignedSubRAV> {
    const db = await this.getDB();
    const tx = db.transaction(['ravs'], 'readonly');
    const store = tx.objectStore('ravs');
    const index = store.index('channelId');
    
    const request = index.openCursor(IDBKeyRange.only(channelId));
    
    while (true) {
      const cursor = await new Promise<IDBCursorWithValue | null>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      if (!cursor) break;
      
      yield cursor.value.ravData;
      cursor.continue();
    }
  }

  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    // Implementation similar to memory store but using IndexedDB
    const result = new Map<string, SignedSubRAV>();
    
    for await (const rav of this.list(channelId)) {
      const key = rav.subRav.vmIdFragment;
      const existing = result.get(key);
      
      if (!existing || rav.subRav.nonce > existing.subRav.nonce) {
        result.set(key, rav);
      }
    }
    
    return result;
  }

  async markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['claims'], 'readwrite');
    const store = tx.objectStore('claims');
    
    const record = {
      channelId,
      vmIdFragment,
      claimedNonce: nonce.toString(),
      timestamp: Date.now(),
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// ==================== Cache Layer Implementations ====================

/**
 * Memory-based cache implementation with TTL support
 */
export class MemoryChannelStateCache implements ChannelStateCache {
  private cache = new Map<string, { value: any; expires?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check TTL
    if (entry.expires && Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const entry: { value: T; expires?: number } = { value };
    
    if (ttl && ttl > 0) {
      entry.expires = Date.now() + ttl;
    }
    
    this.cache.set(key, entry);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}