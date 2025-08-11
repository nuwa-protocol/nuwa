import { AssetInfo } from '../../core/types';

/**
 * Rate provider types for USD pricing and multi-asset settlement
 */

/**
 * Rate provider interface for fetching USD exchange rates
 */
export interface RateProvider {
  /**
   * Get the price of an asset in picoUSD per minimum unit
   * @param assetId - Asset identifier (e.g. '0x3::gas_coin::RGas', 'ethereum', etc.)
   * @returns Price in picoUSD per minimum unit (10^-12 USD)
   */
  getPricePicoUSD(assetId: string): Promise<bigint>;

  /**
   * Get asset information including decimals
   * @param assetId - Asset identifier
   * @returns Asset information or null if not found
   */
  getAssetInfo(assetId: string): Promise<AssetInfo | null>;

  /**
   * Get the timestamp of the last price update for an asset
   * @param assetId - Asset identifier
   * @returns Timestamp in milliseconds, or null if never updated
   */
  getLastUpdated(assetId: string): number | null;

  /**
   * Clear cached data for an asset
   * @param assetId - Asset identifier, or undefined to clear all
   */
  clearCache(assetId?: string): void;
}

/**
 * Base rate provider with common functionality
 */
export abstract class BaseRateProvider implements RateProvider {
  protected cache = new Map<
    string,
    {
      price: bigint;
      timestamp: number;
      assetInfo?: AssetInfo;
    }
  >();
  protected cacheTimeout: number;

  constructor(
    cacheTimeoutMs = 60000 // 1 minute default
  ) {
    this.cacheTimeout = cacheTimeoutMs;
  }

  abstract getPricePicoUSD(assetId: string): Promise<bigint>;

  abstract getAssetInfo(assetId: string): Promise<AssetInfo | null>;

  getLastUpdated(assetId: string): number | null {
    const cached = this.cache.get(assetId);
    return cached?.timestamp || null;
  }

  clearCache(assetId?: string): void {
    if (assetId) {
      this.cache.delete(assetId);
    } else {
      this.cache.clear();
    }
  }

  protected updateCache(assetId: string, price: bigint, assetInfo?: AssetInfo): void {
    this.cache.set(assetId, {
      price,
      timestamp: Date.now(),
      assetInfo,
    });
  }

  protected isCacheValid(assetId: string): boolean {
    const cached = this.cache.get(assetId);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.cacheTimeout;
  }

  protected getCachedPrice(assetId: string): bigint | null {
    const cached = this.cache.get(assetId);
    if (!cached || !this.isCacheValid(assetId)) return null;
    return cached.price;
  }
}

/**
 * Rate fetch result with metadata
 */
export interface RateResult {
  /** Price in picoUSD */
  price: bigint;
  /** Timestamp when fetched */
  timestamp: number;
  /** Data source identifier */
  provider: string;
  /** Asset identifier */
  assetId: string;
}

/**
 * Conversion result with exchange rate information for audit trail
 */
export interface ConversionResult {
  /** Final asset cost in minimum units */
  assetCost: bigint;
  /** Original USD cost in picoUSD */
  usdCost: bigint;
  /** Exchange rate used (picoUSD per minimum unit) */
  priceUsed: bigint;
  /** Timestamp when rate was fetched */
  priceTimestamp: number;
  /** Rate provider identifier */
  rateProvider: string;
  /** Asset identifier used */
  assetId: string;
}

/**
 * Rate provider error types
 */
export class RateProviderError extends Error {
  constructor(
    message: string,
    public readonly assetId?: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = 'RateProviderError';
  }
}

export class RateNotFoundError extends RateProviderError {
  constructor(assetId: string, provider: string) {
    super(`Rate not found for asset ${assetId}`, assetId, provider);
    this.name = 'RateNotFoundError';
  }
}

export class RateStaleError extends RateProviderError {
  constructor(assetId: string, provider: string, lastUpdated?: number) {
    super(`Rate for asset ${assetId} is stale (last updated: ${lastUpdated})`, assetId, provider);
    this.name = 'RateStaleError';
  }
}
