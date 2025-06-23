import { DIDDocument } from '../types';
import { DIDDocumentCache } from './index';

/**
 * A lightweight in-memory LRU cache implementation for DID Documents.
 * It is intentionally dependency-free so that the SDK does not pull in
 * additional packages by default. You can replace it with your own
 * implementation (Redis, IndexedDB, etc.) by implementing the
 * `DIDDocumentCache` interface and providing it to `VDRRegistry.setCache()`.
 */
export class InMemoryLRUDIDDocumentCache implements DIDDocumentCache {
  private readonly capacity: number;
  private readonly map: Map<string, DIDDocument | null>;

  constructor(maxEntries = 1000) {
    this.capacity = maxEntries;
    this.map = new Map<string, DIDDocument | null>();
  }

  get(did: string): DIDDocument | null | undefined {
    if (!this.map.has(did)) return undefined;
    const value = this.map.get(did) ?? null;
    // Refresh the recently used key to the end.
    this.map.delete(did);
    this.map.set(did, value);
    return value;
  }

  set(did: string, doc: DIDDocument | null): void {
    if (this.map.has(did)) {
      this.map.delete(did);
    } else if (this.map.size >= this.capacity) {
      // Evict the least-recently-used entry (Map iteration order is insertion order).
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) {
        this.map.delete(lruKey);
      }
    }
    this.map.set(did, doc);
  }

  has(did: string): boolean {
    return this.map.has(did);
  }

  delete(did: string): void {
    this.map.delete(did);
  }

  clear(): void {
    this.map.clear();
  }
} 