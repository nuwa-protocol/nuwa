import { BillingRule, Strategy, StrategyConfig } from './types';

export type StrategyBuilder<T extends StrategyConfig = StrategyConfig> = (
  cfg: T,
) => Strategy;

const registry = new Map<string, StrategyBuilder>();
// Use WeakMap keyed by BillingRule object reference to avoid collisions when
// different services re-use the same `rule.id`.
let cache: WeakMap<BillingRule, Strategy> = new WeakMap();

/**
 * Register a strategy builder with the global registry.
 * This should be called exactly once per strategy type (during module init).
 */
export function register(type: string, builder: StrategyBuilder): void {
  if (registry.has(type)) {
    // eslint-disable-next-line no-console
    console.warn(`Billing strategy type '${type}' is already registered – overwriting.`);
  }
  registry.set(type, builder);
}

/**
 * Resolve (and lazily cache) a strategy instance for the given rule.
 */
export function getStrategy(rule: BillingRule): Strategy {
  const cached = cache.get(rule);
  if (cached) {
    return cached;
  }

  const builder = registry.get(rule.strategy.type);
  if (!builder) {
    throw new Error(`Unknown billing strategy type '${rule.strategy.type}'. Make sure it has been registered.`);
  }

  const strategy = builder(rule.strategy);
  cache.set(rule, strategy);
  return strategy;
}

/**
 * Clear cached strategy instances – mostly useful for hot-reloading.
 */
export function clearCache(rule?: BillingRule): void {
  if (rule) {
    cache.delete(rule);
  } else {
    cache = new WeakMap();
  }
}
