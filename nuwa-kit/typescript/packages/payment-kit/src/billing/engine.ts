import { Strategy, BillingContext, CostCalculator, ConfigLoader } from './types';
import { StrategyFactory } from './factory';

/**
 * Main billing engine that coordinates strategy execution and caching
 */
export class BillingEngine implements CostCalculator {
  private readonly strategyCache = new Map<string, Strategy>();

  constructor(private readonly configLoader: ConfigLoader) {}

  /**
   * Calculate cost for a billing context
   */
  async calcCost(ctx: BillingContext): Promise<bigint> {
    let strategy = this.strategyCache.get(ctx.serviceId);
    
    if (!strategy) {
      // Load configuration and build strategy
      const config = await this.configLoader.load(ctx.serviceId);
      strategy = StrategyFactory.buildRuleMatcher(config);
      this.strategyCache.set(ctx.serviceId, strategy);
    }

    return strategy.evaluate(ctx);
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