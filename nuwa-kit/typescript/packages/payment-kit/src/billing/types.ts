/**
 * Core billing types and interfaces for the payment-kit billing system
 */

/**
 * Context information for billing calculation
 */
export interface BillingContext {
  /** Service identifier (e.g. "llm-gateway", "mcp-server") */
  serviceId: string;
  /** Operation name (e.g. "chat:completion", "upload") */
  operation: string;
  /** Asset identifier for settlement (e.g. "0x3::gas_coin::RGas", "erc20:USDC") */
  assetId?: string;
  /** Additional metadata for billing calculation */
  meta: Record<string, any>;
}

/**
 * Base strategy interface for billing calculations
 */
export interface Strategy {
  /**
   * Evaluate the cost for a given billing context
   * @param ctx Billing context containing service, operation, and metadata
   * @returns Cost in smallest billing unit (bigint)
   */
  evaluate(ctx: BillingContext): Promise<bigint>;
}

/**
 * Cost calculator interface for services
 */
export interface CostCalculator {
  /**
   * Calculate cost for a billing context
   * @param ctx Billing context
   * @returns Cost in smallest billing unit (bigint)
   */
  calcCost(ctx: BillingContext): Promise<bigint>;
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
  /** Match by model name */
  model?: string;
  /** Match by HTTP method */
  method?: string;
  /** Match by asset identifier */
  assetId?: string;
  /** Match by metadata fields */
  [key: string]: any;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  /** Strategy type */
  type: string;
  /** Strategy-specific configuration */
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