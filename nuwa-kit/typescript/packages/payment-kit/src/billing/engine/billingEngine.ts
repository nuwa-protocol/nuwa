import { BillingContext, BillingRule, CostCalculator, RuleProvider } from '../core/types';
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
export class BillingEngine implements CostCalculator {
  constructor(
    /** Rule provider for accessing the latest billing rules */
    private readonly ruleProvider: RuleProvider,
    /** Optional rate provider for multi-asset settlement */
    private readonly rateProvider?: RateProvider,
  ) {}

  /**
   * Calculate the cost for a request. Internally this will perform rule
   * matching on every call to ensure we always use the latest rule set.
   */
  async calcCost(ctx: BillingContext): Promise<bigint> {
    const rule = findRule(ctx.meta, this.ruleProvider.getRules());
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

  /**
   * Check if a billing rule requires deferred (post-flight) calculation.
   * This is used by middleware to determine whether to calculate costs
   * before or after request execution.
   */
  isDeferred(rule: BillingRule): boolean {
    const strategy = getStrategy(rule);
    return strategy.deferred ?? false;
  }

  /**
   * Alternative API: check if deferred based on rule matching from context.
   * Returns true if the matched rule requires deferred calculation.
   */
  isDeferredByContext(ctx: BillingContext): boolean {
    const rule = findRule(ctx.meta, this.ruleProvider.getRules());
    if (!rule) {
      return false; // No rule = no calculation needed
    }
    return this.isDeferred(rule);
  }
}
