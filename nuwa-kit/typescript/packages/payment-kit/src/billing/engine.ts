/*
 * Compatibility wrapper: allows existing code that instantiates
 * `new BillingEngine(configLoader)` to continue to work while delegating the
 * real work to the Billing V2 engine.
 */

import { BillingEngine as BillingEngineV2 } from './engine/billingEngine';
import { BillingRule } from './core/types';
// Ensure built-in strategies are registered
import './strategies';
import type { BillingContext, ConfigLoader } from './types';

export class BillingEngine {
  private readonly engineCache = new Map<string, BillingEngineV2>();

  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly rateProvider?: import('./rate/types').RateProvider,
  ) {}

  /**
   * Lazily build (or fetch from cache) a V2 engine for the given service.
   */
  private async getEngineForService(serviceId: string): Promise<BillingEngineV2> {
    let engine = this.engineCache.get(serviceId);
    if (!engine) {
      const cfg = await this.configLoader.load(serviceId);
      const rules: BillingRule[] = cfg.rules;
      engine = new BillingEngineV2(() => rules, this.rateProvider);
      this.engineCache.set(serviceId, engine);
    }
    return engine;
  }

  async calcCost(ctx: BillingContext): Promise<bigint> {
    const engine = await this.getEngineForService(ctx.serviceId);
    return engine.calcCost(ctx as any); // cast – structural compatibility
  }

  /**
   * Expose a list of currently cached service IDs (legacy API)
   */
  getCachedServices(): string[] {
    return Array.from(this.engineCache.keys());
  }

  /**
   * Clear cached engines (legacy API)
   */
  clearCache(serviceId?: string): void {
    if (serviceId) {
      this.engineCache.delete(serviceId);
    } else {
      this.engineCache.clear();
    }
  }

  /**
   * Preload (and cache) a strategy for a given service ID (legacy API)
   */
  async preloadStrategy(serviceId: string): Promise<void> {
    await this.getEngineForService(serviceId);
  }
}
