import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { Errors } from '../errors/codes';

/**
 * Cache key for PaymentHub balance
 */
export interface HubBalanceCacheKey {
  ownerDid: string;
  assetId: string;
}

/**
 * Cached balance value with metadata
 */
export interface HubBalanceCacheValue {
  balance: bigint;
  updatedAt: number;  // ms epoch
  source: 'onchain' | 'adjusted';
}

/**
 * Configuration options for HubBalanceService
 */
export interface HubBalanceServiceOptions {
  /** Contract instance for on-chain operations */
  contract: IPaymentChannelContract;
  
  /** Default asset ID if not specified in requests */
  defaultAssetId: string;
  
  /** Normal cache TTL in milliseconds (default: 5000ms = 5s) */
  ttlMs?: number;
  
  /** Negative cache TTL in milliseconds for zero balances (default: 2000ms = 2s) */
  negativeTtlMs?: number;
  
  /** Stale-while-revalidate window in milliseconds (default: 30000ms = 30s) */
  staleWhileRevalidateMs?: number;
  
  /** Maximum cache entries (LRU eviction, default: 10000) */
  maxEntries?: number;
  
  /** Debug logging */
  debug?: boolean;
}

/**
 * Internal cache entry with expiration and staleness tracking
 */
interface CacheEntry extends HubBalanceCacheValue {
  expiresAt: number;
  staleAt: number;
  isRefreshing?: boolean;
}

/**
 * Statistics for observability
 */
export interface HubBalanceStats {
  size: number;
  hits: number;
  misses: number;
  staleHits: number;
  refreshes: number;
  errors: number;
}

/**
 * PaymentHub balance service with short TTL caching and SWR (Stale-While-Revalidate)
 * 
 * Features:
 * - Short TTL for balance freshness (2-5s recommended)
 * - Negative caching for zero balances (1-2s recommended)
 * - SWR: serve stale data while refreshing in background
 * - LRU eviction to prevent memory leaks
 * - No adjust() method to avoid local truth drift
 */
export class HubBalanceService {
  private readonly contract: IPaymentChannelContract;
  private readonly defaultAssetId: string;
  private readonly ttlMs: number;
  private readonly negativeTtlMs: number;
  private readonly staleWhileRevalidateMs: number;
  private readonly maxEntries: number;
  private readonly logger: DebugLogger;
  
  // LRU cache: Map maintains insertion order, we'll manage LRU manually
  private readonly cache = new Map<string, CacheEntry>();
  private readonly stats: HubBalanceStats = {
    size: 0,
    hits: 0,
    misses: 0,
    staleHits: 0,
    refreshes: 0,
    errors: 0,
  };

  constructor(options: HubBalanceServiceOptions) {
    this.contract = options.contract;
    this.defaultAssetId = options.defaultAssetId;
    this.ttlMs = options.ttlMs ?? 5000; // 5s
    this.negativeTtlMs = options.negativeTtlMs ?? 2000; // 2s
    this.staleWhileRevalidateMs = options.staleWhileRevalidateMs ?? 30000; // 30s
    this.maxEntries = options.maxEntries ?? 10000;
    
    this.logger = DebugLogger.get('HubBalanceService');
    this.logger.setLevel(options.debug ? 'debug' : 'info');
    
    this.logger.info('HubBalanceService initialized', {
      ttlMs: this.ttlMs,
      negativeTtlMs: this.negativeTtlMs,
      staleWhileRevalidateMs: this.staleWhileRevalidateMs,
      maxEntries: this.maxEntries,
    });
  }

  /**
   * Get PaymentHub balance with caching and SWR
   * Priority: cache hit > stale hit (with background refresh) > on-chain fetch
   */
  async getBalance(ownerDid: string, assetId?: string): Promise<bigint> {
    const effectiveAssetId = assetId ?? this.defaultAssetId;
    const cacheKey = this.buildCacheKey(ownerDid, effectiveAssetId);
    const now = Date.now();
    
    const entry = this.cache.get(cacheKey);
    
    if (entry) {
      // Move to end (LRU)
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, entry);
      
      if (now < entry.expiresAt) {
        // Fresh hit
        this.stats.hits++;
        this.logger.debug('Cache hit (fresh)', { ownerDid, assetId: effectiveAssetId, balance: entry.balance.toString() });
        return entry.balance;
      } else if (now < entry.staleAt) {
        // Stale hit - serve stale data while refreshing in background
        this.stats.staleHits++;
        this.logger.debug('Cache hit (stale)', { ownerDid, assetId: effectiveAssetId, balance: entry.balance.toString() });
        
        // Trigger background refresh if not already refreshing
        if (!entry.isRefreshing) {
          entry.isRefreshing = true;
          this.refreshInBackground(ownerDid, effectiveAssetId, cacheKey).finally(() => {
            if (this.cache.has(cacheKey)) {
              this.cache.get(cacheKey)!.isRefreshing = false;
            }
          });
        }
        
        return entry.balance;
      }
      // Entry is too stale, fall through to fresh fetch
    }
    
    // Cache miss or entry too stale
    this.stats.misses++;
    this.logger.debug('Cache miss', { ownerDid, assetId: effectiveAssetId });
    
    return this.fetchAndCache(ownerDid, effectiveAssetId, cacheKey);
  }

  /**
   * Force refresh balance from on-chain (bypass cache)
   */
  async refresh(ownerDid: string, assetId: string): Promise<bigint> {
    const cacheKey = this.buildCacheKey(ownerDid, assetId);
    this.logger.debug('Force refresh', { ownerDid, assetId });
    
    // Remove existing cache entry
    this.cache.delete(cacheKey);
    this.stats.refreshes++;
    
    return this.fetchAndCache(ownerDid, assetId, cacheKey);
  }

  /**
   * Get cache statistics for observability
   */
  getStats(): HubBalanceStats {
    return {
      ...this.stats,
      size: this.cache.size,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Remove specific entry from cache
   */
  invalidate(ownerDid: string, assetId?: string): void {
    const effectiveAssetId = assetId ?? this.defaultAssetId;
    const cacheKey = this.buildCacheKey(ownerDid, effectiveAssetId);
    this.cache.delete(cacheKey);
    this.logger.debug('Cache entry invalidated', { ownerDid, assetId: effectiveAssetId });
  }

  private buildCacheKey(ownerDid: string, assetId: string): string {
    return `${ownerDid}:${assetId}`;
  }

  private async fetchAndCache(ownerDid: string, assetId: string, cacheKey: string): Promise<bigint> {
    try {
      this.logger.debug('Fetching balance from on-chain', { ownerDid, assetId });
      
      const balance = await this.contract.getHubBalance(ownerDid, assetId);
      const now = Date.now();
      
      // Use negative TTL for zero balances
      const ttl = balance === 0n ? this.negativeTtlMs : this.ttlMs;
      
      const entry: CacheEntry = {
        balance,
        updatedAt: now,
        source: 'onchain',
        expiresAt: now + ttl,
        staleAt: now + this.staleWhileRevalidateMs,
        isRefreshing: false,
      };
      
      this.setCache(cacheKey, entry);
      
      this.logger.debug('Balance cached', { 
        ownerDid, 
        assetId, 
        balance: balance.toString(),
        ttl,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      });
      
      return balance;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to fetch balance', { ownerDid, assetId, error });
      throw Errors.hubBalanceFetchFailed(error, ownerDid, assetId);
    }
  }

  private async refreshInBackground(ownerDid: string, assetId: string, cacheKey: string): Promise<void> {
    try {
      this.logger.debug('Background refresh started', { ownerDid, assetId });
      await this.fetchAndCache(ownerDid, assetId, cacheKey);
      this.logger.debug('Background refresh completed', { ownerDid, assetId });
    } catch (error) {
      this.logger.warn('Background refresh failed', { ownerDid, assetId, error });
      // Don't throw - background refresh failures should not affect the response
    }
  }

  private setCache(key: string, entry: CacheEntry): void {
    // Implement LRU eviction
    if (this.cache.size >= this.maxEntries) {
      // Remove oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.logger.debug('LRU eviction', { evictedKey: firstKey });
      }
    }
    
    this.cache.set(key, entry);
  }
}
