import { BaseRateProvider, RateProviderError, RateNotFoundError } from './types';
import { AssetInfo } from '../../core/types';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';

/**
 * Contract-based rate provider that uses on-chain oracle/swap prices
 *
 * This provider leverages the payment channel contract's getAssetPrice() method
 * to fetch real-time prices from on-chain sources like oracles or DEX pools.
 */
export class ContractRateProvider extends BaseRateProvider {
  private contract: IPaymentChannelContract;
  private logger: DebugLogger;

  constructor(
    contract: IPaymentChannelContract,
    cacheTimeoutMs = 30000 // 30 seconds default for on-chain data
  ) {
    super(cacheTimeoutMs);
    this.contract = contract;
    this.logger = DebugLogger.get('ContractRateProvider');
  }

  async getPricePicoUSD(assetId: string): Promise<bigint> {
    // Check cache first
    const cached = this.getCachedPrice(assetId);
    if (cached !== null) {
      return cached;
    }

    try {
      // Get price from contract (already in picoUSD)
      const pricePicoUsd = await this.contract.getAssetPrice(assetId);

      if (pricePicoUsd <= 0n) {
        throw new RateNotFoundError(
          `Contract returned invalid price for ${assetId}: ${pricePicoUsd}`,
          assetId
        );
      }

      // Get asset info for caching
      let assetInfo: AssetInfo | undefined;
      try {
        assetInfo = await this.contract.getAssetInfo(assetId);
      } catch (error) {
        this.logger.warn(`Failed to get asset info for ${assetId}, using price only:`, error);
      }

      // Cache the result
      this.updateCache(assetId, pricePicoUsd, assetInfo);

      return pricePicoUsd;
    } catch (error) {
      // Try to return stale cache as fallback
      const staleCache = this.cache.get(assetId);
      if (staleCache) {
        this.logger.warn(`Using stale contract price cache for ${assetId} due to error:`, error);
        return staleCache.price;
      }

      if (error instanceof RateProviderError) {
        throw error;
      }
      throw new RateProviderError(`Failed to get contract price for ${assetId}: ${error}`, assetId);
    }
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo | null> {
    // Check cache first
    const cached = this.cache.get(assetId);
    if (cached?.assetInfo) {
      return cached.assetInfo;
    }

    try {
      // Get asset info from contract
      const info = await this.contract.getAssetInfo(assetId);

      // Cache the result
      this.updateCache(assetId, cached?.price || 0n, info);
      return info;
    } catch (error) {
      this.logger.warn(`Failed to get asset info for ${assetId}:`, error);
      throw error;
    }
  }

  /**
   * Force refresh price from contract (bypass cache)
   */
  async refreshPrice(assetId: string): Promise<bigint> {
    this.clearCache(assetId);
    return this.getPricePicoUSD(assetId);
  }

  /**
   * Get current chain ID from contract
   */
  async getChainId(): Promise<bigint> {
    return this.contract.getChainId();
  }
}
