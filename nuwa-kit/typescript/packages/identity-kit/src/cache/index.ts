import { DIDDocument } from '../types';

// DIDDocument cache interface to support pluggable caching strategies (in-memory, Redis, etc.)
export interface DIDDocumentCache {
  /**
   * Retrieve a cached DID Document, if present.
   * Returns undefined if the DID has not been cached, or null if the DID was previously
   * resolved and not found (negative-cache).
   */
  get(did: string): DIDDocument | null | undefined;

  /**
   * Store the resolution result for a DID. Allows negative-caching by passing null.
   */
  set(did: string, doc: DIDDocument | null): void;

  /**
   * Check whether a DID is present in the cache (either as a DID Document or as a negative entry).
   */
  has(did: string): boolean;

  /**
   * Delete a single DID from the cache.
   */
  delete(did: string): void;

  /**
   * Clear all cached entries.
   */
  clear(): void;
}

export { InMemoryLRUDIDDocumentCache } from './InMemoryLRUDIDDocumentCache';
