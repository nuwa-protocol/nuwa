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
  RequestMetadata,
  ProcessorPaymentResult
} from '../../core/PaymentProcessor';
import { BillingContextBuilder } from '../../core/BillingContextBuilder';
import { HttpPaymentCodec } from './HttpPaymentCodec';
import type { 
  PaymentHeaderPayload,
  HttpRequestPayload, 
  HttpResponsePayload, 
  SignedSubRAV
} from '../../core/types';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import type { CostCalculator, BillingRule, RuleProvider } from '../../billing';
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
   * Framework-agnostic payment processing handler
   */
  async handle(req: GenericHttpRequest, resAdapter: ResponseAdapter, billingRule?: BillingRule): Promise<ProcessorPaymentResult | null> {
    try {
      this.log('🔍 Processing HTTP payment request:', req.method, req.path);
      
      // Step 1: Early payment requirement check if rule is provided
      let cachedPaymentData: HttpRequestPayload | null = null;
      if (billingRule?.paymentRequired) {
        cachedPaymentData = this.extractPaymentData(req.headers);
        if (!cachedPaymentData?.signedSubRav) {
          this.log(`💳 Payment required but no signed SubRAV provided for ${req.method} ${req.path}`);
          resAdapter.setStatus(402).json({
            error: 'Payment Required',
            message: 'Signed SubRAV required for this endpoint',
            code: 'PAYMENT_REQUIRED'
          });
          return null;
        }
        this.log(`💳 Payment data found for ${req.method} ${req.path}`);
      }
      
      // Step 2: Process payment with pre-extracted payment data to avoid re-parsing
      // Use cached payment data or extract from HTTP headers
      const paymentData = cachedPaymentData || this.extractPaymentData(req.headers);
      
      // Build protocol-agnostic request metadata
      const requestMeta = this.buildRequestMetadata(req, paymentData || undefined, billingRule);
      
      // Delegate to PaymentProcessor for core payment logic
      const result = await this.processor.processPayment(
        requestMeta,
        paymentData?.signedSubRav
      );
      
      if (!result.success) {
        const statusCode = this.mapErrorToHttpStatus(result.errorCode);
        resAdapter.setStatus(statusCode).json({ 
          error: result.error || 'Payment required',
          code: result.errorCode,
        });
        return null;
      }

      // Add payment proposal to response if available
      if (result.unsignedSubRAV) {
        this.addPaymentProposalToResponse(resAdapter, result);
      }

      // Success - return result for framework-specific handling
      this.log('✅ Payment processing completed successfully');
      return result;
    } catch (error) {
      this.log('🚨 HTTP payment middleware error:', error);
      resAdapter.setStatus(500).json({ 
        error: 'Payment processing failed',
        code: 'PAYMENT_ERROR',
        details: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
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
   * Build protocol-agnostic request metadata from HTTP request
   */
  private buildRequestMetadata(req: GenericHttpRequest, paymentData?: PaymentHeaderPayload, billingRule?: BillingRule): RequestMetadata {
    return {
      operation: `${req.method.toLowerCase()}:${req.path}`,
      
      // Extract payment channel info from signed SubRAV
      channelId: paymentData?.signedSubRav.subRav.channelId,
      vmIdFragment: paymentData?.signedSubRav.subRav.vmIdFragment,
      maxAmount: paymentData?.maxAmount,
      
      // Pre-matched billing rule (V2 optimization)
      billingRule,
      
      // HTTP-specific metadata for billing rules
      method: req.method,
      path: req.path,
      
      // Also keep HTTP-prefixed versions for other uses
      httpMethod: req.method,
      httpPath: req.path,
      httpQuery: req.query,
      httpBody: req.body,
      httpHeaders: req.headers
    };
  }

  /**
   * Add payment proposal to HTTP response headers
   */
  private addPaymentProposalToResponse(resAdapter: ResponseAdapter, result: ProcessorPaymentResult): void {
    if (!result.unsignedSubRAV) return;

    try {
      const responseHeader = this.codec.encodeResponse(
        result.unsignedSubRAV,
        result.cost,
        result.serviceTxRef || '',
        {
          isHandshake: result.isHandshake,
          autoClaimTriggered: result.autoClaimTriggered
        }
      );

      resAdapter.setHeader(HttpPaymentCodec.getHeaderName(), responseHeader);
      this.log('✅ Added payment proposal to response header');
    } catch (error) {
      this.log('⚠️ Failed to add payment proposal to response:', error);
      // Non-fatal error - don't fail the request
    }
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
   * Security: Check if a client should be rate-limited
   */
  shouldRateLimit(clientId: string): boolean {
    // Delegate to processor or implement HTTP-specific rate limiting
    return false;
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
 * Utility function to create basic billing configuration
 */
export function createBasicBillingConfig(
  serviceId: string,
  defaultPrice: string | bigint
): any {
  return {
    version: 1,
    serviceId,
    rules: [
      {
        id: 'default-pricing',
        default: true,
        strategy: {
          type: 'PerRequest',
          price: defaultPrice.toString()
        }
      }
    ]
  };
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