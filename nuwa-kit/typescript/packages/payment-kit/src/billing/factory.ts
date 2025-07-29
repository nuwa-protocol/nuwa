import { Strategy, StrategyConfig, BillingConfig, BillingRule } from './types';
import { PerRequestStrategy, PerRequestConfig, PerTokenStrategy, PerTokenConfig } from './strategies';

/**
 * Factory for creating billing strategies from configuration
 */
export class StrategyFactory {
  /**
   * Build a strategy from a rule configuration
   */
  static buildStrategy(rule: BillingRule): Strategy {
    const config = rule.strategy;
    
    switch (config.type) {
      case 'PerRequest':
        return new PerRequestStrategy(config as unknown as PerRequestConfig);
      
      case 'PerToken':
        return new PerTokenStrategy(config as unknown as PerTokenConfig);
      
      default:
        throw new Error(`Unknown strategy type: ${config.type}`);
    }
  }

  /**
   * Build a rule matcher strategy from billing configuration
   * This creates a strategy that matches rules and delegates to the appropriate strategy
   */
  static buildRuleMatcher(billingConfig: BillingConfig): Strategy {
    return new RuleMatcherStrategy(billingConfig);
  }
}

/**
 * Strategy that matches rules based on billing context and delegates to the appropriate strategy
 */
class RuleMatcherStrategy implements Strategy {
  private readonly rules: BillingRule[];
  private readonly strategiesCache = new Map<string, Strategy>();

  constructor(private readonly config: BillingConfig) {
    this.rules = config.rules;
  }

  async evaluate(ctx: any): Promise<bigint> {
    // Find the first matching rule
    for (const rule of this.rules) {
      if (this.matchesRule(ctx, rule)) {
        // Get or create strategy for this rule
        let strategy = this.strategiesCache.get(rule.id);
        if (!strategy) {
          strategy = StrategyFactory.buildStrategy(rule);
          this.strategiesCache.set(rule.id, strategy);
        }
        
        return strategy.evaluate(ctx);
      }
    }

    throw new Error(`No matching rule found for context: ${JSON.stringify(ctx)}`);
  }

  /**
   * Check if a billing context matches a rule
   */
  private matchesRule(ctx: any, rule: BillingRule): boolean {
    // If rule is marked as default, it matches everything
    if (rule.default) {
      return true;
    }

    // If no when condition, only default rules match
    if (!rule.when) {
      return false;
    }

    const when = rule.when;

    // Check path matching
    if (when.path && ctx.meta.path !== when.path) {
      return false;
    }

    // Check path regex matching
    if (when.pathRegex) {
      const regex = new RegExp(when.pathRegex);
      if (!regex.test(ctx.meta.path || '')) {
        return false;
      }
    }

    // Check model matching
    if (when.model && ctx.meta.model !== when.model) {
      return false;
    }

    // Check method matching
    if (when.method && ctx.meta.method !== when.method) {
      return false;
    }

    // Check assetId matching
    if (when.assetId && ctx.assetId !== when.assetId) {
      return false;
    }

    // Check other metadata fields
    for (const [key, value] of Object.entries(when)) {
      if (['path', 'pathRegex', 'model', 'method', 'assetId'].includes(key)) {
        continue; // Already checked above
      }

      // Check if metadata has the required field with the required value
      if (ctx.meta[key] !== value) {
        return false;
      }
    }

    return true;
  }
} 