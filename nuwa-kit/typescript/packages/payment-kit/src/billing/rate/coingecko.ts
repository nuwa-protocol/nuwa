import type { RoochClient } from '@roochnetwork/rooch-sdk';
import { BaseRateProvider, AssetInfo, RateProviderError, RateNotFoundError } from './types';

/**
 * CoinGecko rate provider with chain integration support
 */
export class CoingeckoRateProvider extends BaseRateProvider {
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private requestTimeoutMs: number;
  private retryAttempts: number;

  constructor(
    cacheTimeoutMs = 60000, // 1 minute default
    requestTimeoutMs = 5000, // 5 second default
    retryAttempts = 3,
    roochClient?: RoochClient
  ) {
    super(cacheTimeoutMs, roochClient);
    this.requestTimeoutMs = requestTimeoutMs;
    this.retryAttempts = retryAttempts;
  }

  async getPricePicoUSD(assetId: string): Promise<bigint> {
    // Check cache first
    const cached = this.getCachedPrice(assetId);
    if (cached !== null) {
      return cached;
    }

    try {
      // Get asset info to determine decimals
      const assetInfo = await this.getAssetInfo(assetId);
      if (!assetInfo) {
        throw new RateNotFoundError(`Asset info not found for ${assetId}`, assetId);
      }

      // Get the external price ID for CoinGecko
      const priceId = assetInfo.priceId || this.getDefaultPriceId(assetId);
      if (!priceId) {
        throw new RateNotFoundError(`No price ID mapping for asset ${assetId}`, assetId);
      }

      // Fetch price from CoinGecko
      const usdPrice = await this.fetchPriceFromApi(priceId);
      
      // Apply price multiplier if configured
      const adjustedPrice = assetInfo.priceMultiplier 
        ? usdPrice * assetInfo.priceMultiplier 
        : usdPrice;

      // Convert to picoUSD per minimum unit
      const decimals = assetInfo.decimals;
      const pricePerMinimumUnit = adjustedPrice / Math.pow(10, decimals);
      const pricePicoUsd = BigInt(Math.floor(pricePerMinimumUnit * 1e12));

      // Cache the result along with asset info
      this.updateCache(assetId, pricePicoUsd, assetInfo);

      return pricePicoUsd;
    } catch (error) {
      // Try to return stale cache as fallback
      const staleCache = this.cache.get(assetId);
      if (staleCache) {
        console.warn(`Using stale price cache for ${assetId} due to error:`, error);
        return staleCache.price;
      }

      if (error instanceof RateProviderError) {
        throw error;
      }
      throw new RateProviderError(`Failed to get price for ${assetId}: ${error}`, assetId);
    }
  }

  protected getAssetInfoFromConfig(assetId: string): AssetInfo | null {
    const configs = this.getDefaultAssetConfigs();
    const config = configs[assetId];
    
    if (config) {
      return {
        assetId,
        decimals: config.decimals,
        symbol: config.symbol,
        priceId: config.priceId,
        priceMultiplier: config.priceMultiplier,
      };
    }

    return null;
  }

  private async fetchPriceFromApi(priceId: string): Promise<number> {
    const url = `${this.baseUrl}/simple/price?ids=${priceId}&vs_currencies=usd`;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const price = data[priceId]?.usd;
        
        if (typeof price !== 'number' || price <= 0) {
          throw new RateNotFoundError(`Invalid price data for ${priceId}`, priceId);
        }
        
        return price;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryAttempts) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new RateProviderError(
      `Failed to fetch price after ${this.retryAttempts} attempts: ${lastError?.message}`,
      priceId
    );
  }

  private getDefaultPriceId(assetId: string): string | null {
    // Default mappings for common assets
    const mappings: Record<string, string> = {
      'ethereum': 'ethereum',
      'usd-coin': 'usd-coin',
      'bitcoin': 'bitcoin',
      'erc20:ETH': 'ethereum',
      'erc20:USDC': 'usd-coin',
      'erc20:BTC': 'bitcoin',
    };

    return mappings[assetId] || null;
  }

  private getDefaultAssetConfigs(): Record<string, {
    decimals: number;
    symbol?: string;
    priceId?: string;
    priceMultiplier?: number;
  }> {
    return {
      'ethereum': { 
        decimals: 18, 
        symbol: 'ETH',
        priceId: 'ethereum'
      },
      'usd-coin': { 
        decimals: 6, 
        symbol: 'USDC',
        priceId: 'usd-coin'
      },
      'bitcoin': { 
        decimals: 8, 
        symbol: 'BTC',
        priceId: 'bitcoin'
      },
      '0x3::gas_coin::RGas': { 
        decimals: 8, 
        symbol: 'RGAS',
        // Note: RGas might not have a CoinGecko price, this would need custom handling
        priceMultiplier: 0.001 // Example: assume 1 RGas = 0.001 ETH
      },
      'erc20:USDC': { 
        decimals: 6, 
        symbol: 'USDC',
        priceId: 'usd-coin'
      },
      'erc20:ETH': { 
        decimals: 18, 
        symbol: 'ETH',
        priceId: 'ethereum'
      },
    };
  }
} 