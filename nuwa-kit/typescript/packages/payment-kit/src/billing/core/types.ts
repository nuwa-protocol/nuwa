/**
 * Billing V2 – Core stateless type declarations
 *
 * This module MUST remain free of any side-effects so that it can run in any
 * JavaScript runtime (browser / worker / Node) without modification.
 */

export interface BillingContext {
  /** Service identifier (e.g. "llm-gateway", "mcp-server") */
  serviceId: string;
  /** Operation name within the service (e.g. "chat:completion") */
  operation: string;
  /**
   * Optional asset identifier for settlement. If provided and a `RateProvider`
   * is injected into `BillingEngine`, costs will automatically be converted
   * from picoUSD to the asset's smallest unit.
   */
  assetId?: string;
  /** Arbitrary metadata passed along the billing pipeline */
  meta: Record<string, any>;
}

/**
 * Strategy evaluation interface – every billing strategy implements a single
 * asynchronous `evaluate` method returning a `bigint` cost in picoUSD by
 * default.
 */
export interface Strategy {
  evaluate(ctx: BillingContext): Promise<bigint>;
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
 * Declarative billing rule attached to an application route.
 */
export interface BillingRule {
  /** Unique rule identifier */
  id: string;
  /**
   * Condition object describing when this rule applies. **All** fields must
   * match for the rule to be considered a hit.
   */
  when?: Record<string, any>;
  /** Flag indicating this rule is the catch-all default */
  default?: boolean;
  /** Strategy configuration telling the engine how to bill the request */
  strategy: StrategyConfig;
  /** Optional auth / permission flags (checked by middleware, not the engine) */
  authRequired?: boolean;
  adminOnly?: boolean;
  paymentRequired?: boolean;
}
