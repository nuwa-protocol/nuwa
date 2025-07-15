import { Strategy, BillingContext, CostCalculator, ConfigLoader } from './types';
import { StrategyFactory } from './factory';
import { RateProvider, ConversionResult, RateProviderError } from './rate/types';

/**
 * USD billing engine that converts USD costs to asset-specific amounts
 */
export class UsdBillingEngine implements CostCalculator {
  private readonly strategyCache = new Map<string, Strategy>();

  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly rateProvider: RateProvider,
    private readonly defaultAssetConfigs: Record<string, { decimals: number }> = {}
  ) {}

  /**
   * Calculate cost with USD conversion
   */
  async calcCost(ctx: BillingContext): Promise<bigint> {
    const result = await this.calcCostWithDetails(ctx);
    return result.assetCost;
  }

  /**
   * Calculate cost with full conversion details for auditing
   */
  async calcCostWithDetails(ctx: BillingContext): Promise<ConversionResult> {
    if (!ctx.assetId) {
      throw new Error('assetId is required for USD billing engine');
    }

    // Get strategy and calculate USD cost
    let strategy = this.strategyCache.get(ctx.serviceId);
    if (!strategy) {
      const config = await this.configLoader.load(ctx.serviceId);
      strategy = StrategyFactory.buildRuleMatcher(config);
      this.strategyCache.set(ctx.serviceId, strategy);
    }

    const usdCost = await strategy.evaluate(ctx);

    // Convert to asset cost
    return this.convertUsdToAsset(usdCost, ctx.assetId);
  }

  /**
   * Convert USD cost to asset cost with exchange rate
   */
  private async convertUsdToAsset(
    usdCost: bigint,
    assetId: string
  ): Promise<ConversionResult> {
    if (usdCost === 0n) {
      // Special case: zero cost
      return {
        assetCost: 0n,
        usdCost,
        priceUsed: 0n,
        priceTimestamp: Date.now(),
        rateProvider: 'none',
        assetId,
      };
    }

    try {
      const price = await this.rateProvider.getPricePicoUSD(assetId);
      const priceTimestamp = this.rateProvider.getLastUpdated(assetId) ?? Date.now();
      
      if (price <= 0n) {
        throw new RateProviderError(`Invalid price for asset ${assetId}: ${price}`);
      }

      // Get asset decimals
      const decimals = await this.getAssetDecimals(assetId);
      const decimalMultiplier = BigInt(10 ** decimals);

      // Calculate asset cost with ceiling (向上取整)
      // Formula: assetCost = ceil(usdCost * decimals / price)
      const assetCost = (usdCost * decimalMultiplier + price - 1n) / price;

      return {
        assetCost,
        usdCost,
        priceUsed: price,
        priceTimestamp,
        rateProvider: 'rate-provider', // Could be enhanced to get actual provider name
        assetId,
      };
    } catch (error) {
      throw new RateProviderError(
        `Failed to convert USD to asset ${assetId}: ${error}`,
        assetId
      );
    }
  }

  /**
   * Get asset decimal places
   */
  private async getAssetDecimals(assetId: string): Promise<number> {
    try {
      // First try to get from rate provider (which may query chain)
      const assetInfo = await this.rateProvider.getAssetInfo(assetId);
      if (assetInfo) {
        return assetInfo.decimals;
      }
    } catch (error) {
      console.warn(`Failed to get asset info from rate provider for ${assetId}:`, error);
    }

    // Fallback to hardcoded defaults
    const config = this.defaultAssetConfigs[assetId];
    if (config) {
      return config.decimals;
    }

    // Final fallback based on asset type
    if (assetId.includes('::gas_coin::') || assetId.startsWith('0x')) {
      return 18; // Most blockchain native tokens
    } else if (assetId.includes('usdc') || assetId.includes('USDC')) {
      return 6; // USDC standard
    } else if (assetId.includes('btc') || assetId.includes('BTC')) {
      return 8; // Bitcoin standard
    }
    
    // Conservative default
    return 18;
  }

  /**
   * Clear strategy cache for a specific service or all services
   */
  clearCache(serviceId?: string): void {
    if (serviceId) {
      this.strategyCache.delete(serviceId);
    } else {
      this.strategyCache.clear();
    }
  }

  /**
   * Preload and cache strategy for a service
   */
  async preloadStrategy(serviceId: string): Promise<void> {
    if (!this.strategyCache.has(serviceId)) {
      const config = await this.configLoader.load(serviceId);
      const strategy = StrategyFactory.buildRuleMatcher(config);
      this.strategyCache.set(serviceId, strategy);
    }
  }

  /**
   * Get cached service IDs
   */
  getCachedServices(): string[] {
    return Array.from(this.strategyCache.keys());
  }

  /**
   * Set asset configuration for fallback
   * @deprecated Use RateProvider.getAssetInfo() instead
   */
  setAssetConfig(assetId: string, config: { decimals: number }): void {
    this.defaultAssetConfigs[assetId] = config;
  }
}

/**
 * Default asset decimal configurations
 */
export const DEFAULT_ASSET_DECIMALS: Record<string, { decimals: number }> = {
  'ethereum': { decimals: 18 },
  'usd-coin': { decimals: 6 },
  'bitcoin': { decimals: 8 },
  '0x3::gas_coin::RGas': { decimals: 18 }, // Rooch gas token
  'erc20:USDC': { decimals: 6 },
  'erc20:ETH': { decimals: 18 },
}; 