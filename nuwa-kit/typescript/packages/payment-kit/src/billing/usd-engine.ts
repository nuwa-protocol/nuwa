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

      // Calculate asset cost with ceiling
      // Formula: assetCost = ceil(usdCost / price)
      // price is already in picoUSD per smallest unit, so no need to multiply by decimals
      const assetCost = (usdCost + price - 1n) / price;

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

}