/**
 * Billing – Core stateless type declarations
 *
 * This module MUST remain free of any side-effects so that it can run in any
 * JavaScript runtime (browser / worker / Node) without modification.
 */

import type { SignedSubRAV } from '../../core/types';

export interface BillingContext {
    /** Service identifier (e.g. "llm-gateway", "mcp-server") */
    serviceId: string;
    /**
     * Optional asset identifier for settlement. If provided and a `RateProvider`
     * is injected into `BillingEngine`, costs will automatically be converted
     * from picoUSD to the asset's smallest unit.
     */
    assetId?: string;
    /** All billing-related context information */
    meta: {
      /** Business operation identifier (e.g., "POST:/api/chat/completions") */
      operation: string;
      /** Pre-matched billing rule (optimization to avoid duplicate rule matching) */
      billingRule?: BillingRule;
      /** HTTP path */
      path?: string;
      /** HTTP method */
      method?: string;
      /** Usage data for post-flight billing (e.g. token counts) */
      usage?: Record<string, any>;
      /** Signed SubRAV for payment verification (contains channelId and vmIdFragment) */
      signedSubRav?: SignedSubRAV;
      /** Additional arbitrary metadata */
      [key: string]: any;
    };
  }
  
  /**
   * Strategy evaluation interface – every billing strategy implements a single
   * asynchronous `evaluate` method returning a `bigint` cost in picoUSD by
   * default.
   */
  export interface Strategy {
    evaluate(ctx: BillingContext): Promise<bigint>;
    /**
     * Whether this strategy requires execution results (usage data) to calculate costs.
     * - `false` (default): Can calculate cost before request execution (pre-flight)
     * - `true`: Must wait for request execution to complete (post-flight)
     */
    readonly deferred?: boolean;
  }
  
  /**
   * Strategy configuration blob coming from declarative route rules.
   */
  export interface StrategyConfig {
    /** Strategy type – e.g. `PerRequest`, `PerToken` */
    type: string;
    /** Additional arbitrary fields consumed by the concrete strategy */
    [key: string]: any;
  }
  
  
  /**
   * Interface for providing billing rules to the BillingEngine.
   * This replaces the ConfigLoader pattern and removes serviceId dependency.
   */
  export interface RuleProvider {
    /**
     * Returns the current set of billing rules.
     * Called by BillingEngine on each cost calculation to ensure latest rules.
     */
    getRules(): BillingRule[];
  }
  
  /**
   * Configuration for billing rules
   */
  export interface BillingRule {
    /** Unique identifier for the rule */
    id: string;
    /** Condition to match for this rule */
    when?: BillingCondition;
    /** Whether this is the default rule */
    default?: boolean;
    /** Strategy configuration */
    strategy: StrategyConfig;
    /** Whether DID authentication is required for this rule */
    authRequired?: boolean;
    /** Whether admin authorization is required for this rule (implies authRequired: true) */
    adminOnly?: boolean;
    /** Whether payment (signed SubRAV) is required for this rule */
    paymentRequired?: boolean;
  }
  
  /**
   * Condition matching for billing rules
   */
  export interface BillingCondition {
    /** Match by path */
    path?: string;
    /** Match by path regex */
    pathRegex?: string;
    /** Match by HTTP method */
    method?: string;
    /** Match by metadata fields */
    [key: string]: any;
  }
  
  /**
   * Complete billing configuration
   */
  export interface BillingConfig {
    /** Configuration version */
    version: number;
    /** Service identifier */
    serviceId: string;
    /** List of billing rules */
    rules: BillingRule[];
  }
  
  /**
   * Configuration loader interface
   */
  export interface ConfigLoader {
    /**
     * Load billing configuration for a service
     * @param serviceId Service identifier
     * @returns Billing configuration
     */
    load(serviceId: string): Promise<BillingConfig>;
  } 

/**
 * Interface for calculating costs
 */
export interface CostCalculator {
  calcCost(ctx: BillingContext): Promise<bigint>;
  calcCostByRule(ctx: BillingContext, rule: BillingRule): Promise<bigint>;
  /**
   * Check if a billing rule requires deferred (post-flight) calculation
   * @param rule The billing rule to check
   * @returns true if the rule requires post-flight billing, false otherwise
   */
  isDeferred(rule: BillingRule): boolean;
}

/**
 * @deprecated Use BillingContext.meta instead
 * This type alias is provided for backward compatibility during migration
 */
export type RequestMetadata = BillingContext['meta'];