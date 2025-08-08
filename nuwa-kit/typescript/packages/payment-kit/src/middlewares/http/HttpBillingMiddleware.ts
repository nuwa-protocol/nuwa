/**
 * Refactored HTTP Payment Middleware
 * 
 * This middleware now serves as a protocol adapter that delegates payment
 * processing to the PaymentProcessor component. It focuses only on HTTP-specific
 * concerns like request/response handling and error mapping.
 */

import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { 
  PaymentProcessorConfig,
  ProcessorPaymentResult
} from '../../core/PaymentProcessor';
import type { BillingContext } from '../../billing';
import { HttpPaymentCodec } from './HttpPaymentCodec';
import type { 
  PaymentHeaderPayload,
  HttpRequestPayload, 
  HttpResponsePayload, 
  SignedSubRAV
} from '../../core/types';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import type { CostCalculator, BillingRule, RuleProvider } from '../../billing';
import { findRule } from '../../billing/core/rule-matcher';
import type { PendingSubRAVRepository } from '../../storage/interfaces/PendingSubRAVRepository';
import type { ClaimScheduler } from '../../core/ClaimScheduler';

// Generic HTTP interfaces (framework-agnostic)
export interface GenericHttpRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, any>;
  body?: any;
}

export interface ResponseAdapter {
  setStatus(code: number): ResponseAdapter;
  json(obj: any): ResponseAdapter | void;
  setHeader(name: string, value: string): ResponseAdapter;
}

// Express types (for backward compatibility)
interface ExpressRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, any>;
  body?: any;
}

interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(obj: any): ExpressResponse;
  setHeader(name: string, value: string): ExpressResponse;
  headersSent: boolean;
}

interface NextFunction {
  (error?: any): void;
}

/**
 * Payment session for deferred billing - simplified to use unified BillingContext
 */
export interface PaymentSession {
  rule: BillingRule;
  signedSubRav?: SignedSubRAV;
  ctx: BillingContext;
  paymentRequired: boolean;
}

/**
 * Configuration for the HTTP billing middleware
 */
export interface HttpBillingMiddlewareConfig {
  /** Payee client for payment operations */
  payeeClient: PaymentChannelPayeeClient;
  /** Billing engine for cost calculation */
  billingEngine: CostCalculator;
  /** Rule provider for pre-matching billing rules (V2 optimization) */
  ruleProvider?: RuleProvider;
  /** Service ID for billing configuration */
  serviceId: string;
  /** Default asset ID if not provided in request context */
  defaultAssetId?: string;
  /** Debug logging */
  debug?: boolean;
  /** Store for pending unsigned SubRAV proposals */
  pendingSubRAVStore?: PendingSubRAVRepository;
  /** Optional claim scheduler for automated claiming */
  claimScheduler?: ClaimScheduler;
}

/**
 * HTTP-specific error codes mapped to HTTP status codes
 */
export enum HttpPaymentErrorCode {
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',      // 402
  INVALID_PAYMENT = 'INVALID_PAYMENT',        // 400
  UNKNOWN_SUBRAV = 'UNKNOWN_SUBRAV',          // 400
  TAMPERED_SUBRAV = 'TAMPERED_SUBRAV',        // 400
  PAYMENT_ERROR = 'PAYMENT_ERROR',            // 500
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',  // 402
  CHANNEL_CLOSED = 'CHANNEL_CLOSED',          // 400
  EPOCH_MISMATCH = 'EPOCH_MISMATCH',          // 400
  MAX_AMOUNT_EXCEEDED = 'MAX_AMOUNT_EXCEEDED' // 400
}

/**
 * Refactored HTTP Billing Middleware
 * 
 * Now serves as a thin protocol adapter that:
 * 1. Extracts HTTP-specific request data
 * 2. Delegates payment processing to PaymentProcessor
 * 3. Maps results back to HTTP responses
 * 4. Handles HTTP-specific error formatting
 */
export class HttpBillingMiddleware {
  private processor: PaymentProcessor;
  private codec: HttpPaymentCodec;
  private config: HttpBillingMiddlewareConfig;

  constructor(config: HttpBillingMiddlewareConfig) {
    this.config = config;
    
    // Initialize PaymentProcessor with config
    this.processor = new PaymentProcessor({
      payeeClient: config.payeeClient,
      billingEngine: config.billingEngine,
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId,
      pendingSubRAVStore: config.pendingSubRAVStore,
      claimScheduler: config.claimScheduler,
      debug: config.debug
    });

    // Initialize HTTP codec
    this.codec = new HttpPaymentCodec();
  }

  /**
   * New unified billing handler using the three-step process
   */
  async handleWithNewAPI(req: GenericHttpRequest): Promise<{
    ctx: BillingContext;
    isDeferred: boolean;
  } | null> {
    try {
      this.log('🔍 Processing HTTP payment request with new API:', req.method, req.path);
      
      // Step 1: Find matching billing rule
      const rule = this.findBillingRule(req);
      
      if (!rule) {
        this.log('📝 No billing rule matched - proceeding without payment processing');
        return null;
      }

      // Step 2: Build initial billing context
      const paymentData = this.extractPaymentData(req.headers);
      const ctx = this.buildBillingContext(req, paymentData || undefined, rule);
      
      // Step 3: Pre-process the request
      const processedCtx = await this.processor.preProcess(ctx);
      
      // Step 4: Check if verification failed
      if (processedCtx.state && processedCtx.state.signedSubRavVerified === false) {
        this.log('🚨 Payment verification failed during pre-processing');
        return null;
      }
      
      // Step 5: Check if this is deferred billing
      const isDeferred = this.isBillingDeferred(rule);
      
      this.log(`📋 Request pre-processed for ${rule.strategy.type}, deferred: ${isDeferred}`);
      if (processedCtx.state) {
        this.log(`📋 Context state:`, {
          signedSubRavVerified: processedCtx.state.signedSubRavVerified,
          cost: processedCtx.state.cost,
          headerValue: !!processedCtx.state.headerValue
        });
      }
      return { ctx: processedCtx, isDeferred };

    } catch (error) {
      this.log('🚨 New API payment processing error:', error);
      return null;
    }
  }

  /**
   * Complete billing settlement synchronously (Step B & C) - for on-headers use
   */
  settleBillingSync(ctx: BillingContext, usage?: Record<string, any>, resAdapter?: ResponseAdapter): boolean {
    try {
      this.log('🔄 Settling billing synchronously with usage:', usage);
      
      // Use the processor's synchronous settle method
      const settledCtx = this.processor.settle(ctx, usage);
      
      if (!settledCtx.state?.headerValue) {
        this.log('⚠️ No header value generated during settlement');
        return false;
      }

      // Add response header if adapter provided
      if (resAdapter) {
        resAdapter.setHeader('X-Payment-Channel-Data', settledCtx.state.headerValue);
        this.log('✅ Payment header added to response synchronously');
      }

      return true;
    } catch (error) {
      this.log('🚨 Synchronous billing settlement error:', error);
      return false;
    }
  }

  /**
   * Persist billing results (Step D) - async persistence only
   */
  async persistBilling(ctx: BillingContext): Promise<void> {
    try {
      this.log('💾 Persisting billing results');
      
      if (ctx.state?.unsignedSubRav) {
        await this.processor.persist(ctx);
        this.log('✅ Billing results persisted successfully');
      } else {
        this.log('⚠️ No SubRAV to persist');
      }
    } catch (error) {
      this.log('🚨 Billing persistence error:', error);
      throw error;
    }
  }

  /**
   * Find matching billing rule for the request
   */
  private findBillingRule(req: GenericHttpRequest): BillingRule | undefined {
    if (!this.config.ruleProvider) {
      throw new Error('RuleProvider is required for auto-detection. Please configure it in HttpBillingMiddlewareConfig.');
    }
    
    const meta = {
      path: req.path,
      method: req.method,
      // Include other relevant metadata for rule matching
      httpQuery: req.query,
      httpBody: req.body,
      httpHeaders: req.headers
    };
    
    return findRule(meta, this.config.ruleProvider.getRules());
  }

  /**
   * Check if billing for this rule should be deferred (post-flight)
   */
  private isBillingDeferred(rule: BillingRule): boolean {
    // Now that isDeferred is part of the CostCalculator interface,
    // we can call it directly without type checking
    return this.config.billingEngine.isDeferred(rule);
  }

  /**
   * Extract payment data from HTTP request headers
   */
  extractPaymentData(headers: Record<string, string | string[] | undefined>): PaymentHeaderPayload | null {
    const headerValue = HttpPaymentCodec.extractPaymentHeader(headers);
    
    if (!headerValue) {
      return null;
    }

    try {
      return this.codec.decodePayload(headerValue);
    } catch (error) {
      throw new Error(`Invalid payment channel header: ${error}`);
    }
  }

  /**
   * Build billing context from HTTP request
   */
  private buildBillingContext(req: GenericHttpRequest, paymentData?: PaymentHeaderPayload, billingRule?: BillingRule): BillingContext {
    return {
      serviceId: this.config.serviceId,
      assetId: this.config.defaultAssetId,
      meta: {
        operation: `${req.method.toLowerCase()}:${req.path}`,
        
        // Pre-matched billing rule (V2 optimization)
        billingRule,
        
        // Payment data from HTTP headers
        maxAmount: paymentData?.maxAmount,
        signedSubRav: paymentData?.signedSubRav,
        clientTxRef: paymentData?.clientTxRef,
        
        // HTTP-specific metadata for billing rules
        method: req.method,
        path: req.path,
        
        // Also keep HTTP-prefixed versions for other uses
        httpMethod: req.method,
        httpPath: req.path,
        httpQuery: req.query,
        httpBody: req.body,
        httpHeaders: req.headers
      }
    };
  }

  /**
   * Map error code to HTTP status code
   */
  private mapErrorToHttpStatus(errorCode?: string): number {
    switch (errorCode) {
      case HttpPaymentErrorCode.PAYMENT_REQUIRED:
      case HttpPaymentErrorCode.INSUFFICIENT_FUNDS:
        return 402; // Payment Required
      
      case HttpPaymentErrorCode.INVALID_PAYMENT:
      case HttpPaymentErrorCode.UNKNOWN_SUBRAV:
      case HttpPaymentErrorCode.TAMPERED_SUBRAV:
      case HttpPaymentErrorCode.CHANNEL_CLOSED:
      case HttpPaymentErrorCode.EPOCH_MISMATCH:
      case HttpPaymentErrorCode.MAX_AMOUNT_EXCEEDED:
        return 400; // Bad Request
      
      case HttpPaymentErrorCode.PAYMENT_ERROR:
      default:
        return 500; // Internal Server Error
    }
  }

  /**
   * Get payment processing statistics
   */
  getProcessingStats() {
    return this.processor.getProcessingStats();
  }

  /**
   * Get claim status from processor
   */
  getClaimStatus() {
    if (this.config.claimScheduler) {
      return this.config.claimScheduler.getStatus();
    }
    return { isRunning: false, activeClaims: 0, failedAttempts: 0 };
  }

  /**
   * Manually trigger claim for a channel
   */
  async manualClaim(channelId: string): Promise<boolean> {
    if (this.config.claimScheduler) {
      const results = await this.config.claimScheduler.triggerClaim(channelId);
      return results.length > 0;
    }
    
    this.log('No ClaimScheduler configured - manual claim not available');
    return false;
  }

  /**
   * Clear expired pending SubRAV proposals
   */
  async clearExpiredProposals(maxAgeMinutes: number = 30): Promise<number> {
    return await this.processor.clearExpiredProposals(maxAgeMinutes);
  }

  /**
   * Find pending SubRAV proposal
   */
  async findPendingProposal(channelId: string, nonce: bigint): Promise<any> {
    return await this.processor.findPendingProposal(channelId, nonce);
  }

  /**
   * Find the latest pending SubRAV proposal for a channel
   */
  async findLatestPendingProposal(channelId: string): Promise<any> {
    return await this.processor.findLatestPendingProposal(channelId);
  }

  /**
   * Create ExpressJS ResponseAdapter
   */
  private createExpressResponseAdapter(res: ExpressResponse): ResponseAdapter {
    return {
      setStatus: (code: number) => {
        res.status(code);
        return this.createExpressResponseAdapter(res); // Return adapter for chaining
      },
      json: (obj: any) => {
        res.json(obj);
        // Note: Express res.json() returns void, so we return void to match interface
      },
      setHeader: (name: string, value: string) => {
        res.setHeader(name, value);
        return this.createExpressResponseAdapter(res); // Return adapter for chaining
      }
    };
  }

  /**
   * Debug logging
   */ 
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[HttpBillingMiddleware]', ...args);
    }
  }

  /**
   * Static factory method for creating middleware
   */
  static create(config: HttpBillingMiddlewareConfig): HttpBillingMiddleware {
    return new HttpBillingMiddleware(config);
  }

  /**
   * Static factory method with billing engine
   */
  static createWithBillingEngine(
    payeeClient: PaymentChannelPayeeClient,
    billingEngine: CostCalculator,
    serviceId: string,
    options: Partial<HttpBillingMiddlewareConfig> = {}
  ): HttpBillingMiddleware {
    return new HttpBillingMiddleware({
      payeeClient,
      billingEngine,
      serviceId,
      ...options
    });
  }
}

/**
 * Utility function to create ExpressJS ResponseAdapter
 */
export function createExpressResponseAdapter(res: any): ResponseAdapter {
  return {
    setStatus: (code: number) => {
      res.status(code);
      return createExpressResponseAdapter(res);
    },
    json: (obj: any) => {
      res.json(obj);
    },
    setHeader: (name: string, value: string) => {
      res.setHeader(name, value);
      return createExpressResponseAdapter(res);
    }
  };
}

// Re-export ProcessorPaymentResult for framework integrations
export type { ProcessorPaymentResult } from '../../core/PaymentProcessor';

/**
 * Utility function to create Koa ResponseAdapter (example for other frameworks)
 */
export function createKoaResponseAdapter(ctx: any): ResponseAdapter {
  return {
    setStatus: (code: number) => {
      ctx.status = code;
      return createKoaResponseAdapter(ctx);
    },
    json: (obj: any) => {
      ctx.body = obj;
    },
    setHeader: (name: string, value: string) => {
      ctx.set(name, value);
      return createKoaResponseAdapter(ctx);
    }
  };
} 