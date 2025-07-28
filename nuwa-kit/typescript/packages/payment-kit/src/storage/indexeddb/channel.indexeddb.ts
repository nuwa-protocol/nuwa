 /**
 * Browser IndexedDB-based ChannelRepository implementation
 */

import type { ChannelInfo, SubChannelState } from '../../core/types';
import type { ChannelRepository } from '../interfaces/ChannelRepository';
import type { PaginationParams, ChannelFilter, PaginatedResult, CacheStats } from '../types/pagination';

export class IndexedDBChannelRepository implements ChannelRepository {
  private dbName = 'nuwa-payment-kit-channels';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Channel metadata store
        if (!db.objectStoreNames.contains('channels')) {
          const store = db.createObjectStore('channels', { keyPath: 'channelId' });
          store.createIndex('payerDid', 'payerDid', { unique: false });
          store.createIndex('payeeDid', 'payeeDid', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
        
        // Sub-channel states store
        if (!db.objectStoreNames.contains('subChannelStates')) {
          const store = db.createObjectStore('subChannelStates', { 
            keyPath: ['channelId', 'keyId'] 
          });
          store.createIndex('channelId', 'channelId', { unique: false });
        }
      };
    });
  }

  // -------- Channel Metadata Operations --------

  async getChannelMetadata(channelId: string): Promise<ChannelInfo | null> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readonly');
    const store = tx.objectStore('channels');
    
    return new Promise((resolve, reject) => {
      const request = store.get(channelId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async setChannelMetadata(channelId: string, metadata: ChannelInfo): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readwrite');
    const store = tx.objectStore('channels');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ ...metadata, channelId });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listChannelMetadata(
    filter?: ChannelFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<ChannelInfo>> {
    const db = await this.getDB();
    const tx = db.transaction(['channels'], 'readonly');
    const store = tx.objectStore('channels');
    
    const channels: ChannelInfo[] = [];
    
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const channel = cursor.value as ChannelInfo;
          
          // Apply filters
          let includeChannel = true;
          if (filter) {
            if (filter.payerDid && channel.payerDid !== filter.payerDid) includeChannel = false;
            if (filter.payeeDid && channel.payeeDid !== filter.payeeDid) includeChannel = false;
            if (filter.status && channel.status !== filter.status) includeChannel = false;
            if (filter.assetId && channel.assetId !== filter.assetId) includeChannel = false;
            // Note: ChannelInfo doesn't have createdAt field in current definition
            // These filters are not supported yet
            // if (filter.createdAfter && channel.createdAt < filter.createdAfter) includeChannel = false;
            // if (filter.createdBefore && channel.createdAt > filter.createdBefore) includeChannel = false;
          }
          
          if (includeChannel) {
            channels.push(channel);
          }
          
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });

    const totalCount = channels.length;
    
    // Apply pagination
    const offset = pagination?.offset || 0;
    const limit = pagination?.limit || 50;
    const paginatedChannels = channels.slice(offset, offset + limit);

    return {
      items: paginatedChannels,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
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

  // -------- Sub-Channel State Operations --------

  async getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannelStates'], 'readonly');
    const store = tx.objectStore('subChannelStates');
    
    const existing = await new Promise<SubChannelState | null>((resolve, reject) => {
      const request = store.get([channelId, keyId]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    
    if (existing) {
      return {
        ...existing,
        nonce: BigInt(existing.nonce as any),
        accumulatedAmount: BigInt(existing.accumulatedAmount as any),
      };
    }

    // Return default state if not found
    const defaultState: SubChannelState = {
      channelId,
      epoch: BigInt(0),
      nonce: BigInt(0),
      accumulatedAmount: BigInt(0),
      lastUpdated: Date.now(),
    };
    
    // Save the default state
    await this.updateSubChannelState(channelId, keyId, defaultState);
    return defaultState;
  }

  async updateSubChannelState(
    channelId: string,
    keyId: string,
    updates: Partial<SubChannelState>
  ): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannelStates'], 'readwrite');
    const store = tx.objectStore('subChannelStates');
    
    // Get existing state first
    const existing = await new Promise<SubChannelState | null>((resolve, reject) => {
      const request = store.get([channelId, keyId]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    const baseState = existing || {
      channelId,
      keyId,
      epoch: BigInt(0),
      nonce: BigInt(0),
      accumulatedAmount: BigInt(0),
      lastUpdated: Date.now(),
    };

    const updated = {
      ...baseState,
      ...updates,
      channelId,
      keyId,
      lastUpdated: Date.now(),
      // Convert bigints to strings for storage
      nonce: (updates.nonce || baseState.nonce).toString(),
      accumulatedAmount: (updates.accumulatedAmount || baseState.accumulatedAmount).toString(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(updated);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannelStates'], 'readonly');
    const store = tx.objectStore('subChannelStates');
    const index = store.index('channelId');
    
    const result: Record<string, SubChannelState> = {};
    
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(channelId));
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const state = cursor.value;
          result[state.keyId] = {
            ...state,
            nonce: BigInt(state.nonce),
            accumulatedAmount: BigInt(state.accumulatedAmount),
          };
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
    
    return result;
  }

  async removeSubChannelState(channelId: string, keyId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['subChannelStates'], 'readwrite');
    const store = tx.objectStore('subChannelStates');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete([channelId, keyId]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // -------- Management Operations --------

  async getStats(): Promise<CacheStats> {
    const db = await this.getDB();
    
    const channelCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(['channels'], 'readonly');
      const store = tx.objectStore('channels');
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const subChannelCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(['subChannelStates'], 'readonly');
      const store = tx.objectStore('subChannelStates');
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return {
      channelCount,
      subChannelCount,
      hitRate: undefined, // Not tracked in IndexedDB implementation
      sizeBytes: undefined, // Hard to estimate in IndexedDB
    };
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['channels', 'subChannelStates'], 'readwrite');
    
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('channels').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const request = tx.objectStore('subChannelStates').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);
  }
}