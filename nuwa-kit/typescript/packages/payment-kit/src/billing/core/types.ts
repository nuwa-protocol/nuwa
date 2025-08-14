/**
 * Billing – Core stateless type declarations
 *
 * This module MUST remain free of any side-effects so that it can run in any
 * JavaScript runtime (browser / worker / Node) without modification.
 */

import type { ChannelInfo, SignedSubRAV, SubRAV, SubChannelInfo } from '../../core/types';
import type { RateResult } from '../rate/types';
import type { PaymentError as CentralPaymentError } from '../../errors/codes';

// Re-export centralized PaymentError type for BillingContext usage
export type PaymentError = CentralPaymentError;

export interface BillingContext {
  /** Service identifier (e.g. "llm-gateway", "mcp-server") */
  serviceId: string;
  /**
   * Optional asset identifier for settlement. If provided and a `RateProvider`
   * is injected into `BillingEngine`, costs will automatically be converted
   * from picoUSD to the asset's smallest unit.
   */
  assetId?: string; // deprecated: use channelInfo.assetId in ctx.state (to be removed in Phase 2)
  /** All billing-related context information (input only) */
  meta: {
    /** Business operation identifier (e.g., "POST:/api/chat/completions") */
    operation: string;
    /** Pre-matched billing rule (optimization to avoid duplicate rule matching) */
    billingRule?: BillingRule;
    /** HTTP path */
    path?: string;
    /** HTTP method */
    method?: string;
    /** Signed SubRAV for payment verification (contains channelId and vmIdFragment) */
    signedSubRav?: SignedSubRAV;
    /** Client transaction reference for tracking and idempotency */
    clientTxRef: string;
    /** Maximum amount limit for this request */
    maxAmount?: bigint;
    /** Additional arbitrary metadata */
    [key: string]: any;
  };
  /** Runtime state (mutable outputs from billing process) */
  state?: {
    // Step A: Verification
    signedSubRavVerified?: boolean;
    /** Latest SignedSubRAV from storage for this sub-channel (fetched during preProcess) */
    latestSignedSubRav?: SignedSubRAV;
    /** Latest pending SubRAV from pending repository, it should match the signed SubRAV */
    latestPendingSubRav?: SubRAV;
    /** Latest sub-channel state cursor (from ChannelRepository) */
    subChannelState?: SubChannelInfo;
    /** Channel info (must exist for verification) */
    channelInfo?: ChannelInfo;
    /** Cached chain ID for synchronous proposal building (to be removed when all paths use channelInfo.chainId) */
    chainId?: bigint;

    // Step B: Charging
    cost?: bigint;
    /** Pre-fetched exchange rate used for conversion (if asset settlement is used) */
    exchangeRate?: RateResult;

    // Step C: Issuing
    unsignedSubRav?: SubRAV;
    headerValue?: string;
    serviceTxRef?: string;
    nonce?: bigint;

    // Protocol-level error (used to short-circuit response with error header)
    error?: PaymentError;

    // Step D: Persistence
    persisted?: boolean;

    // Post-flight usage data
    usage?: Record<string, any>;
  };
}

/**
 * Strategy evaluation interface – every billing strategy implements a single
 * asynchronous `evaluate` method returning a `bigint` cost in picoUSD by
 * default.
 */
export interface Strategy {
  /**
   * Synchronous cost evaluation returning picoUSD cost.
   * units: caller-provided usage units (must be a positive integer). For PerRequest, pass 1.
   */
  evaluate(ctx: BillingContext, units: number): bigint;
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
