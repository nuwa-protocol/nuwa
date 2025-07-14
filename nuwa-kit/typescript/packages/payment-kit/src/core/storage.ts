/**
 * Storage layer interfaces and implementations for Payment Kit
 * Supports both Payer and Payee workflows
 */

import type { SignedSubRAV, SubChannelState, ChannelMetadata } from './types';

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

/**
 * Channel state cache interface for Payer (客户端付款方)
 * Manages local sub-channel state for generating next SubRAV
 */
export interface ChannelStateCache {
  /** Get channel metadata */
  getChannelMetadata(channelId: string): Promise<ChannelMetadata | null>;
  
  /** Set channel metadata */
  setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void>;

  /** Get sub-channel state for nonce and amount tracking */
  getSubChannelState(keyId: string): Promise<SubChannelState>;
  
  /** Update sub-channel state */
  updateSubChannelState(keyId: string, updates: Partial<SubChannelState>): Promise<void>;

  /** Clear all cached data */
  clear(): Promise<void>;
}

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

/**
 * Memory-based channel state cache implementation
 */
export class MemoryChannelStateCache implements ChannelStateCache {
  private channels = new Map<string, ChannelMetadata>();
  private subChannels = new Map<string, SubChannelState>();

  async getChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
    return this.channels.get(channelId) || null;
  }

  async setChannelMetadata(channelId: string, metadata: ChannelMetadata): Promise<void> {
    this.channels.set(channelId, metadata);
  }

  async getSubChannelState(keyId: string): Promise<SubChannelState> {
    return this.subChannels.get(keyId) || {
      channelId: '',
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    };
  }

  async updateSubChannelState(keyId: string, updates: Partial<SubChannelState>): Promise<void> {
    const current = await this.getSubChannelState(keyId);
    this.subChannels.set(keyId, {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    });
  }

  async clear(): Promise<void> {
    this.channels.clear();
    this.subChannels.clear();
  }
}

/**
 * Browser IndexedDB-based implementations
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

export class IndexedDBChannelStateCache implements ChannelStateCache {
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
} 