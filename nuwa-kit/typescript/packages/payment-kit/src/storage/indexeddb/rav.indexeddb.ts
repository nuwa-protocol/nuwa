/**
 * Browser IndexedDB-based RAVRepository implementation
 */

import type { SignedSubRAV } from '../../core/types';
import type { RAVRepository } from '../interfaces/RAVRepository';

export class IndexedDBRAVRepository implements RAVRepository {
  private dbName = 'nuwa-payment-kit-ravs';
  private version = 1;

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // RAVs store
        if (!db.objectStoreNames.contains('ravs')) {
          const store = db.createObjectStore('ravs', {
            keyPath: ['channelId', 'vmIdFragment', 'nonce'],
          });
          store.createIndex('channelId', 'channelId', { unique: false });
          store.createIndex('channel_vm', ['channelId', 'vmIdFragment'], { unique: false });
        }

        // Claims tracking store
        if (!db.objectStoreNames.contains('claims')) {
          db.createObjectStore('claims', {
            keyPath: ['channelId', 'vmIdFragment'],
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

  async get(channelId: string, vmIdFragment: string, nonce: bigint): Promise<SignedSubRAV | null> {
    const db = await this.getDB();
    const tx = db.transaction(['ravs'], 'readonly');
    const store = tx.objectStore('ravs');
    const index = store.index('channel_vm');

    return new Promise((resolve, reject) => {
      const request = index.get(IDBKeyRange.only([channelId, vmIdFragment]));
      request.onsuccess = () => resolve(request.result);
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
    const result = new Map<string, SignedSubRAV>();

    // Get claimed nonces first
    const claimedNonces = await this.getClaimedNonces(channelId);

    for await (const rav of this.list(channelId)) {
      const vmIdFragment = rav.subRav.vmIdFragment;
      const claimedNonce = claimedNonces.get(vmIdFragment) || BigInt(0);

      if (rav.subRav.nonce > claimedNonce) {
        const existing = result.get(vmIdFragment);
        if (!existing || rav.subRav.nonce > existing.subRav.nonce) {
          result.set(vmIdFragment, rav);
        }
      }
    }

    return result;
  }

  private async getClaimedNonces(channelId: string): Promise<Map<string, bigint>> {
    const db = await this.getDB();
    const tx = db.transaction(['claims'], 'readonly');
    const store = tx.objectStore('claims');

    const result = new Map<string, bigint>();

    return new Promise((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          if (record.channelId === channelId) {
            result.set(record.vmIdFragment, BigInt(record.claimedNonce));
          }
          cursor.continue();
        } else {
          resolve(result);
        }
      };

      request.onerror = () => reject(request.error);
    });
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

  async getStats(): Promise<{ totalRAVs: number; unclaimedRAVs: number }> {
    const db = await this.getDB();

    // Count total RAVs
    const totalRAVs = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(['ravs'], 'readonly');
      const store = tx.objectStore('ravs');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Count unclaimed RAVs (this is an approximation - could be more precise)
    let unclaimedRAVs = 0;
    const channelVMs = new Set<string>();

    // First pass: collect all channel-vm combinations
    const tx1 = db.transaction(['ravs'], 'readonly');
    const store1 = tx1.objectStore('ravs');

    await new Promise<void>((resolve, reject) => {
      const request = store1.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          channelVMs.add(`${record.channelId}:${record.vmIdFragment}`);
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });

    // For each channel-vm combination, check if there are unclaimed RAVs
    for (const channelVM of channelVMs) {
      const [channelId, vmIdFragment] = channelVM.split(':');
      const unclaimed = await this.getUnclaimedRAVs(channelId);
      if (unclaimed.has(vmIdFragment)) {
        unclaimedRAVs++;
      }
    }

    return { totalRAVs, unclaimedRAVs };
  }

  async cleanup(): Promise<number> {
    // For IndexedDB, we can implement cleanup by removing claimed RAVs
    let cleanedCount = 0;
    const db = await this.getDB();

    // Get all claimed nonces
    const claimedNonces = new Map<string, bigint>();
    const tx1 = db.transaction(['claims'], 'readonly');
    const store1 = tx1.objectStore('claims');

    await new Promise<void>((resolve, reject) => {
      const request = store1.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          claimedNonces.set(
            `${record.channelId}:${record.vmIdFragment}`,
            BigInt(record.claimedNonce)
          );
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });

    // Remove claimed RAVs
    const tx2 = db.transaction(['ravs'], 'readwrite');
    const store2 = tx2.objectStore('ravs');

    await new Promise<void>((resolve, reject) => {
      const request = store2.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          const key = `${record.channelId}:${record.vmIdFragment}`;
          const claimedNonce = claimedNonces.get(key);

          if (claimedNonce && BigInt(record.nonce) <= claimedNonce) {
            cursor.delete();
            cleanedCount++;
          }

          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });

    return cleanedCount;
  }
}
