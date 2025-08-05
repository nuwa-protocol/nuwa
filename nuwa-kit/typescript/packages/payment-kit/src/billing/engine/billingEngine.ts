import { BillingContext, BillingRule } from '../core/types';
import { findRule } from '../core/rule-matcher';
import { getStrategy } from '../core/strategy-registry';
import { RateProvider } from '../rate/types';
import { convertUsdToAsset } from '../core/converter';

/**
 * BillingEngine (V2)
 *
 * Responsible for:
 * 1. Finding the matching rule for a request (single match per request)
 * 2. Delegating cost calculation to the corresponding strategy
 * 3. Optionally converting USD costs to asset costs using a `RateProvider`
 *
 * The engine itself is stateful – it maintains no internal cache except what
 * `strategy-registry` does at the process level.
 */
export class BillingEngine {
  constructor(
    /** Function returning the latest rule list. Allows dynamic hot-reloading. */
    private readonly getRules: () => BillingRule[],
    /** Optional rate provider for multi-asset settlement */
    private readonly rateProvider?: RateProvider,
  ) {}

  /**
   * Calculate the cost for a request. Internally this will perform rule
   * matching on every call to ensure we always use the latest rule set.
   */
  async calcCost(ctx: BillingContext): Promise<bigint> {
    const rule = findRule(ctx.meta, this.getRules());
    if (!rule) {
      throw new Error('No billing rule matched the provided context.');
    }

    return this.calcCostByRule(ctx, rule);
  }

  /**
   * Calculate cost when the rule is already known (pre-flight middleware).
   */
  async calcCostByRule(ctx: BillingContext, rule: BillingRule): Promise<bigint> {
    const usdCost = await getStrategy(rule).evaluate(ctx);

    if (ctx.assetId && this.rateProvider) {
      const result = await convertUsdToAsset(usdCost, ctx.assetId, this.rateProvider);
      return result.assetCost;
    }

    return usdCost;
  }
}
