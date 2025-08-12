import type { BillingContext } from '../core/types';
import { BaseStrategy } from './base';

/**
 * FinalCost strategy configuration
 * - No options. Incoming usage MUST be picoUSD (integer) value.
 */
export interface FinalCostConfig {}

/**
 * Final-cost passthrough billing strategy
 *
 * This strategy is used when the application already knows the final USD cost
 * (either computed internally or received from a provider). The application
 * MUST pass picoUSD (integer) via the `usage` parameter to `settle()`.
 * This strategy returns that picoUSD as bigint for downstream asset conversion.
 */
export class FinalCostStrategy extends BaseStrategy {
  /** Requires post-flight usage to be available */
  readonly deferred: boolean = true;

  constructor(_config: FinalCostConfig = {}) {
    super();
  }

  override evaluate(_ctx: BillingContext, units: number): bigint {
    const value = Number.isFinite(units) && units > 0 ? Math.floor(units) : 0;
    return BigInt(value);
  }
}


