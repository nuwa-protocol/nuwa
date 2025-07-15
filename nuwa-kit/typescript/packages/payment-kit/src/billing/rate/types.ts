import type { RoochClient } from '@roochnetwork/rooch-sdk';
import { Args } from '@roochnetwork/rooch-sdk';

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
 * Asset information including on-chain metadata
 */
export interface AssetInfo {
  /** Asset identifier */
  assetId: string;
  /** Number of decimal places for this asset */
  decimals: number;
  /** Symbol for display (optional) */
  symbol?: string;
  /** Name for display (optional) */
  name?: string;
  /** External price feed identifier (e.g., coingecko id) */
  priceId?: string;
  /** Price multiplier for low-value assets */
  priceMultiplier?: number;
}

/**
 * Base rate provider with common functionality
 */
export abstract class BaseRateProvider implements RateProvider {
  protected cache = new Map<string, {
    price: bigint;
    timestamp: number;
    assetInfo?: AssetInfo;
  }>();
  protected cacheTimeout: number;
  protected roochClient?: RoochClient;

  constructor(
    cacheTimeoutMs = 60000, // 1 minute default
    roochClient?: RoochClient
  ) {
    this.cacheTimeout = cacheTimeoutMs;
    this.roochClient = roochClient;
  }

  abstract getPricePicoUSD(assetId: string): Promise<bigint>;

  async getAssetInfo(assetId: string): Promise<AssetInfo | null> {
    // Check cache first
    const cached = this.cache.get(assetId);
    if (cached?.assetInfo) {
      return cached.assetInfo;
    }

    try {
      // Try to get from chain first (for Rooch assets)
      if (this.roochClient && this.isRoochAsset(assetId)) {
        const info = await this.getAssetInfoFromChain(assetId);
        if (info) {
          // Cache the result
          this.updateCache(assetId, cached?.price || 0n, info);
          return info;
        }
      }

      // Fallback to static configuration
      return this.getAssetInfoFromConfig(assetId);
    } catch (error) {
      console.warn(`Failed to get asset info for ${assetId}:`, error);
      return this.getAssetInfoFromConfig(assetId);
    }
  }

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

  /**
   * Check if an asset is a Rooch asset (can be queried from chain)
   */
  protected isRoochAsset(assetId: string): boolean {
    return assetId.includes('::') || assetId.startsWith('0x');
  }

  /**
   * Get asset info from Rooch chain
   */
  private async getAssetInfoFromChain(assetId: string): Promise<AssetInfo | null> {
    if (!this.roochClient) return null;

    try {
      // For Rooch coin types, we can get the decimals from the chain
      // Use the coin metadata registry
      const result = await this.roochClient.executeViewFunction({
        target: '0x3::coin::decimals_by_type_name',
        args: [Args.string(assetId)],
        typeArgs: [],
      });

      if (result.vm_status === 'Executed' && result.return_values?.[0]) {
        const decimals = Number(result.return_values[0].decoded_value);
        
        // Also try to get symbol and name
        const [symbolResult, nameResult] = await Promise.all([
          this.roochClient.executeViewFunction({
            target: '0x3::coin::symbol_by_type_name',
            args: [Args.string(assetId)],
            typeArgs: [],
          }).catch(() => null),
          this.roochClient.executeViewFunction({
            target: '0x3::coin::name_by_type_name',
            args: [Args.string(assetId)],
            typeArgs: [],
          }).catch(() => null),
        ]);

        const symbol = symbolResult?.return_values?.[0]?.decoded_value as string;
        const name = nameResult?.return_values?.[0]?.decoded_value as string;

        return {
          assetId,
          decimals,
          symbol,
          name,
        };
      }
    } catch (error) {
      console.warn(`Failed to get chain info for ${assetId}:`, error);
    }

    return null;
  }

  /**
   * Get asset info from static configuration (fallback)
   */
  protected abstract getAssetInfoFromConfig(assetId: string): AssetInfo | null;
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
 * Rate provider configuration
 */
export interface RateProviderConfig {
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to enable debug logging */
  debug?: boolean;
  /** Asset configurations */
  assets?: Record<string, AssetInfo>;
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
    super(
      `Rate for asset ${assetId} is stale (last updated: ${lastUpdated})`,
      assetId,
      provider
    );
    this.name = 'RateStaleError';
  }
} 