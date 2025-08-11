/**
 * Refactored HTTP Payment Middleware
 *
 * This middleware now serves as a protocol adapter that delegates payment
 * processing to the PaymentProcessor component. It focuses only on HTTP-specific
 * concerns like request/response handling and error mapping.
 */

import { PaymentProcessor } from '../../core/PaymentProcessor';
import type { PaymentProcessorConfig } from '../../core/PaymentProcessor';
import type { BillingContext } from '../../billing';
import { HttpPaymentCodec } from './HttpPaymentCodec';
import type {
  PaymentHeaderPayload,
  HttpRequestPayload,
  HttpResponsePayload,
  SignedSubRAV,
} from '../../core/types';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import type { BillingRule, RuleProvider } from '../../billing';
import type { RateProvider } from '../../billing/rate/types';
import { findRule } from '../../billing/core/rule-matcher';
import type { PendingSubRAVRepository } from '../../storage/interfaces/PendingSubRAVRepository';
import type { ClaimScheduler } from '../../core/ClaimScheduler';
import type { RAVRepository } from '../../storage/interfaces/RAVRepository';
import { DIDResolver } from '@nuwa-ai/identity-kit';

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

interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(obj: any): ExpressResponse;
  setHeader(name: string, value: string): ExpressResponse;
  headersSent: boolean;
}

/**
 * Configuration for the HTTP billing middleware
 */
export interface HttpBillingMiddlewareConfig {
  /** Payee client for payment operations */
  payeeClient: PaymentChannelPayeeClient;
  /** Rule provider for pre-matching billing rules (V2 optimization) */
  ruleProvider: RuleProvider;
  /** Rate provider for asset conversion (preferred path) */
  rateProvider: RateProvider;
  /** Service ID for billing configuration */
  serviceId: string;
  /** Default asset ID if not provided in request context */
  defaultAssetId?: string;
  /** Debug logging */
  debug?: boolean;
  /** Store for pending unsigned SubRAV proposals */
  pendingSubRAVStore: PendingSubRAVRepository;
  /** Repository for persisted SignedSubRAVs to retrieve latest baseline */
  ravRepository: RAVRepository;
  /** DID resolver for signature verification */
  didResolver: DIDResolver;
  /** Optional claim scheduler for automated claiming */
  claimScheduler?: ClaimScheduler;
}

/**
 * HTTP-specific error codes mapped to HTTP status codes
 */
export enum HttpPaymentErrorCode {
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED', // 402
  SUBRAV_CONFLICT = 'SUBRAV_CONFLICT', // 409
  MISSING_CHANNEL_CONTEXT = 'MISSING_CHANNEL_CONTEXT', // 409
  INVALID_PAYMENT = 'INVALID_PAYMENT', // 400
  UNKNOWN_SUBRAV = 'UNKNOWN_SUBRAV', // 400
  TAMPERED_SUBRAV = 'TAMPERED_SUBRAV', // 400
  PAYMENT_ERROR = 'PAYMENT_ERROR', // 500
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS', // 402
  CHANNEL_CLOSED = 'CHANNEL_CLOSED', // 400
  EPOCH_MISMATCH = 'EPOCH_MISMATCH', // 400
  MAX_AMOUNT_EXCEEDED = 'MAX_AMOUNT_EXCEEDED', // 400
  CLIENT_TX_REF_MISSING = 'CLIENT_TX_REF_MISSING', // 400
  RATE_NOT_AVAILABLE = 'RATE_NOT_AVAILABLE', // 500
  BILLING_CONFIG_ERROR = 'BILLING_CONFIG_ERROR', // 500
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
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId,
      rateProvider: config.rateProvider,
      pendingSubRAVStore: config.pendingSubRAVStore,
      ravRepository: config.ravRepository,
      claimScheduler: config.claimScheduler,
      didResolver: config.didResolver,
      debug: config.debug,
    });

    // Initialize HTTP codec
    this.codec = new HttpPaymentCodec();
  }

  /**
   * New unified billing handler using the three-step process
   */
  async handleWithNewAPI(req: GenericHttpRequest): Promise<BillingContext | null> {
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

      this.log(`📋 Request pre-processed for ${rule.strategy.type}`);
      if (processedCtx.state) {
        this.log(`📋 Context state:`, {
          signedSubRavVerified: processedCtx.state.signedSubRavVerified,
          cost: processedCtx.state.cost,
          headerValue: !!processedCtx.state.headerValue,
        });
      }
      return processedCtx;
    } catch (error) {
      this.log('🚨 New API payment processing error:', error);
      return null;
    }
  }

  /**
   * Complete billing settlement synchronously (Step B & C) - for on-headers use
   */
  settleBillingSync(ctx: BillingContext, usage?: number, resAdapter?: ResponseAdapter): boolean {
    try {
      this.log('🔄 Settling billing synchronously with usage:', usage);

      // Use the processor's synchronous settle method
      const settledCtx = this.processor.settle(ctx, usage);

      // Check if this is a free route that should not generate headers
      if (ctx.meta.billingRule && !ctx.meta.billingRule.paymentRequired) {
        this.log('📝 Free route - skipping payment header generation');
        return true; // Successfully handled, no header needed
      }

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
      throw new Error(
        'RuleProvider is required for auto-detection. Please configure it in HttpBillingMiddlewareConfig.'
      );
    }

    const meta = {
      path: req.path,
      method: req.method,
      // Include other relevant metadata for rule matching
      httpQuery: req.query,
      httpBody: req.body,
      httpHeaders: req.headers,
    };

    return findRule(meta, this.config.ruleProvider.getRules());
  }

  /**
   * Extract payment data from HTTP request headers
   */
  extractPaymentData(
    headers: Record<string, string | string[] | undefined>
  ): PaymentHeaderPayload | null {
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
  private buildBillingContext(
    req: GenericHttpRequest,
    paymentData?: PaymentHeaderPayload,
    billingRule?: BillingRule
  ): BillingContext {
    return {
      serviceId: this.config.serviceId,
      meta: {
        operation: `${req.method.toLowerCase()}:${req.path}`,

        // Pre-matched billing rule (V2 optimization)
        billingRule,

        // Payment data from HTTP headers
        maxAmount: paymentData?.maxAmount,
        signedSubRav: paymentData?.signedSubRav,
        clientTxRef: paymentData?.clientTxRef || crypto.randomUUID(),
        // DIDAuth (ExpressPaymentKit attaches didInfo onto req)
        didInfo: (req as any).didInfo,

        // HTTP-specific metadata for billing rules
        method: req.method,
        path: req.path,

        // Also keep HTTP-prefixed versions for other uses
        httpMethod: req.method,
        httpPath: req.path,
        httpQuery: req.query,
        httpBody: req.body,
        httpHeaders: req.headers,
      },
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

      case HttpPaymentErrorCode.SUBRAV_CONFLICT:
      case HttpPaymentErrorCode.MISSING_CHANNEL_CONTEXT:
        return 409; // Conflict

      case HttpPaymentErrorCode.INVALID_PAYMENT:
      case HttpPaymentErrorCode.UNKNOWN_SUBRAV:
      case HttpPaymentErrorCode.TAMPERED_SUBRAV:
      case HttpPaymentErrorCode.CHANNEL_CLOSED:
      case HttpPaymentErrorCode.EPOCH_MISMATCH:
      case HttpPaymentErrorCode.MAX_AMOUNT_EXCEEDED:
      case HttpPaymentErrorCode.CLIENT_TX_REF_MISSING:
        return 400; // Bad Request

      case HttpPaymentErrorCode.PAYMENT_ERROR:
      case HttpPaymentErrorCode.RATE_NOT_AVAILABLE:
      case HttpPaymentErrorCode.BILLING_CONFIG_ERROR:
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
  async findPendingProposal(channelId: string, vmIdFragment: string, nonce: bigint): Promise<any> {
    return await this.processor.findPendingProposal(channelId, vmIdFragment, nonce);
  }

  /**
   * Find the latest pending SubRAV proposal for a channel
   */
  async findLatestPendingProposal(channelId: string, vmIdFragment: string): Promise<any> {
    return await this.processor.findLatestPendingProposal(channelId, vmIdFragment);
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
      },
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
    },
  };
}

// No longer re-export ProcessorPaymentResult; results are available via BillingContext.state

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
    },
  };
}
