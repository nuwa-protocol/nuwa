import { DIDDocument, DIDDocumentCache, DIDResolver } from './types/did';
import { VDRInterface, DIDCreationRequest, DIDCreationResult, CADOPCreationRequest } from './types/vdr';

import { InMemoryLRUDIDDocumentCache } from './InMemoryLRUDIDDocumentCache';

/**
 * Global registry for VDR (Verifiable Data Registry) implementations
 */
export class VDRRegistry implements DIDResolver {
  private static instance: VDRRegistry;
  private vdrs: Map<string, VDRInterface> = new Map();

  private cache: DIDDocumentCache;

  private constructor() {
    // Use the default in-memory cache unless overridden by the developer.
    this.cache = new InMemoryLRUDIDDocumentCache();
  }

  static getInstance(): VDRRegistry {
    if (!this.instance) {
      this.instance = new VDRRegistry();
    }
    return this.instance;
  }

  registerVDR(vdr: VDRInterface) {
    this.vdrs.set(vdr.getMethod(), vdr);
  }

  getVDR(method: string): VDRInterface | undefined {
    return this.vdrs.get(method);
  }

  /**
   * Override the default cache implementation.
   * This allows developers to provide their own cache (e.g., Redis, browser storage).
   */
  setCache(cache: DIDDocumentCache) {
    this.cache = cache;
  }

  /**
   * Returns the currently configured cache instance.
   */
  getCache(): DIDDocumentCache {
    return this.cache;
  }

  async resolveDID(did: string, options?: { forceRefresh?: boolean }): Promise<DIDDocument | null> {
    const method = did.split(':')[1];
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    // Attempt to serve from cache if allowed.
    if (!options?.forceRefresh) {
      const cached = this.cache.get(did);
      if (cached !== undefined) {
        return cached;
      }
    }

    const resolved = await vdr.resolve(did);
    // Cache the resolution result (including null for negative caching).
    this.cache.set(did, resolved);
    return resolved;
  }

  async createDID(
    method: string,
    creationRequest: DIDCreationRequest,
    options?: Record<string, any>
  ): Promise<DIDCreationResult> {
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    const result = await vdr.create(creationRequest, options);
    if (result.success && result.didDocument) {
      this.cache.set(result.didDocument.id, result.didDocument);
    }
    return result;
  }

  async createDIDViaCADOP(
    method: string,
    creationRequest: CADOPCreationRequest,
    options?: Record<string, any>
  ): Promise<DIDCreationResult> {
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    const result = await vdr.createViaCADOP(creationRequest, options);
    if (result.success && result.didDocument) {
      this.cache.set(result.didDocument.id, result.didDocument);
    }
    return result;
  }

  async exists(did: string): Promise<boolean> {
    const method = did.split(':')[1];
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    // If we have a positive cache entry, short-circuit the call.
    if (this.cache.has(did)) {
      const doc = this.cache.get(did);
      return doc !== null;
    }

    const exists = await vdr.exists(did);
    // We don't cache the existence check result here to avoid stale data.
    return exists;
  }
}
