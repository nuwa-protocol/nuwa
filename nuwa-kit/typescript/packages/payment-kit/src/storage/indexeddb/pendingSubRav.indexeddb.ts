/**
 * Browser IndexedDB-based PendingSubRAVRepository implementation
 */

import type { SubRAV } from '../../core/types';
import type { PendingSubRAVRepository } from '../interfaces/PendingSubRAVRepository';
import type { PendingSubRAVStats } from '../types/pagination';

export class IndexedDBPendingSubRAVRepository implements PendingSubRAVRepository {
  private dbName = 'nuwa-payment-kit-pending-subravs';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Pending SubRAVs store
        if (!db.objectStoreNames.contains('pendingSubRAVs')) {
          const store = db.createObjectStore('pendingSubRAVs', { 
            keyPath: ['channelId', 'nonce'] 
          });
          store.createIndex('channelId', 'channelId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async save(subRAV: SubRAV): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readwrite');
    const store = tx.objectStore('pendingSubRAVs');
    
    const record = {
      channelId: subRAV.channelId,
      nonce: subRAV.nonce.toString(),
      subRAVData: {
        ...subRAV,
        nonce: subRAV.nonce.toString(),
        accumulatedAmount: subRAV.accumulatedAmount.toString(),
      },
      timestamp: Date.now(),
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async find(channelId: string, nonce: bigint): Promise<SubRAV | null> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readonly');
    const store = tx.objectStore('pendingSubRAVs');
    
    const record = await new Promise<any>((resolve, reject) => {
      const request = store.get([channelId, nonce.toString()]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!record) {
      return null;
    }

    // Convert back to SubRAV with proper bigint types
    return {
      ...record.subRAVData,
      nonce: BigInt(record.subRAVData.nonce),
      accumulatedAmount: BigInt(record.subRAVData.accumulatedAmount),
    };
  }

  async findLatestByChannel(channelId: string): Promise<SubRAV | null> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readonly');
    const store = tx.objectStore('pendingSubRAVs');
    const channelIndex = store.index('by-channel');
    
    let latestSubRAV: SubRAV | null = null;
    let maxNonce = BigInt(-1);

    // Use cursor to iterate through all records for this channel
    const cursorRequest = channelIndex.openCursor(IDBKeyRange.only(channelId));
    
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const record = cursor.value;
          const subRAV = {
            ...record.subRAVData,
            nonce: BigInt(record.subRAVData.nonce),
            accumulatedAmount: BigInt(record.subRAVData.accumulatedAmount),
          };
          
          if (subRAV.nonce > maxNonce) {
            maxNonce = subRAV.nonce;
            latestSubRAV = subRAV;
          }
          
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(new Error(`Failed to iterate through pending SubRAVs for channel '${channelId}': ${cursorRequest.error?.message || 'Unknown error'}`));
    });

    return latestSubRAV;
  }

  async remove(channelId: string, nonce: bigint): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readwrite');
    const store = tx.objectStore('pendingSubRAVs');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete([channelId, nonce.toString()]);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cleanup(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readwrite');
    const store = tx.objectStore('pendingSubRAVs');
    const index = store.index('timestamp');
    
    const cutoff = Date.now() - maxAgeMs;
    let cleanedCount = 0;
    
    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cleanedCount++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });

    return cleanedCount;
  }

  async getStats(): Promise<PendingSubRAVStats> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readonly');
    const store = tx.objectStore('pendingSubRAVs');
    
    const byChannel: Record<string, number> = {};
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;
    let totalCount = 0;
    
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          totalCount++;
          
          byChannel[record.channelId] = (byChannel[record.channelId] || 0) + 1;
          
          if (oldestTimestamp === undefined || record.timestamp < oldestTimestamp) {
            oldestTimestamp = record.timestamp;
          }
          if (newestTimestamp === undefined || record.timestamp > newestTimestamp) {
            newestTimestamp = record.timestamp;
          }
          
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });

    return {
      totalCount,
      byChannel,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['pendingSubRAVs'], 'readwrite');
    const store = tx.objectStore('pendingSubRAVs');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
} 