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
// import { BillingContextBuilder } from '../../core/BillingContextBuilder';
import { HttpPaymentCodec } from './HttpPaymentCodec';
import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SignedSubRAV
} from '../../core/types';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import type { CostCalculator } from '../../billing/types';
import type { PendingSubRAVStore } from '../../core/PendingSubRAVStore';
import type { ClaimScheduler } from '../../core/claim-scheduler';

// Express types (optional dependency)
interface Request {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, any>;
  body?: any;
}

interface Response {
  status(code: number): Response;
  json(obj: any): Response;
  setHeader(name: string, value: string): Response;
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
  /** Service ID for billing configuration */
  serviceId: string;
  /** Default asset ID if not provided in request context */
  defaultAssetId?: string;
  /** Debug logging */
  debug?: boolean;
  /** Store for pending unsigned SubRAV proposals */
  pendingSubRAVStore?: PendingSubRAVStore;
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
  EPOCH_MISMATCH = 'EPOCH_MISMATCH'           // 400
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
   * Create Express middleware function
   */
  createExpressMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        this.log('🔍 Processing HTTP payment request:', req.method, req.path);
        
        const result = await this.processHttpPayment(req);
        
        if (!result.success) {
          const statusCode = this.mapErrorToHttpStatus(result.errorCode);
          return res.status(statusCode).json({ 
            error: result.error || 'Payment required',
            code: result.errorCode,
            assetId: result.assetId
          });
        }

        // Add payment proposal to response if available
        if (result.unsignedSubRAV) {
          this.addPaymentProposalToResponse(res, result);
        }

        // Attach payment result to request for downstream handlers
        (req as any).paymentResult = result;
        
        next();
      } catch (error) {
        this.log('🚨 HTTP payment middleware error:', error);
        res.status(500).json({ 
          error: 'Payment processing failed',
          code: 'PAYMENT_ERROR',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    };
  }

  /**
   * Process HTTP payment request
   */
  async processHttpPayment(req: Request): Promise<ProcessorPaymentResult> {
    // 1. Extract payment data from HTTP headers
    const paymentData = this.extractPaymentData(req.headers as Record<string, string>);
    
    // 2. Build protocol-agnostic request metadata
    const requestMeta = this.buildRequestMetadata(req, paymentData || undefined);
    
    // 3. Delegate to PaymentProcessor for core payment logic
    const result = await this.processor.processPayment(
      requestMeta,
      paymentData?.signedSubRav
    );

    return result;
  }

  /**
   * Extract payment data from HTTP request headers
   */
  private extractPaymentData(headers: Record<string, string>): HttpRequestPayload | null {
    const headerValue = HttpPaymentCodec.extractPaymentHeader(headers);
    
    if (!headerValue) {
      return null;
    }

    try {
      const decoded = this.codec.decode(headerValue);
      return {
        signedSubRav: decoded.signedSubRAV,
        ...(decoded.metadata || {})
      };
    } catch (error) {
      throw new Error(`Invalid payment channel header: ${error}`);
    }
  }

  /**
   * Build protocol-agnostic request metadata from HTTP request
   */
  private buildRequestMetadata(req: Request, paymentData?: HttpRequestPayload): RequestMetadata {
    return {
      operation: `${req.method.toLowerCase()}:${req.path}`,
      
      // Extract business parameters from query/body
      model: req.query?.model || req.body?.model,
      assetId: req.query?.assetId || req.body?.assetId,
      
      // Extract payment channel info from signed SubRAV
      channelId: paymentData?.signedSubRav.subRav.channelId,
      vmIdFragment: paymentData?.signedSubRav.subRav.vmIdFragment,
      
      // HTTP-specific metadata
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
  private addPaymentProposalToResponse(res: Response, result: ProcessorPaymentResult): void {
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

      res.setHeader(HttpPaymentCodec.getHeaderName(), responseHeader);
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
   * Security: Check if a client should be rate-limited
   */
  shouldRateLimit(clientId: string): boolean {
    // Delegate to processor or implement HTTP-specific rate limiting
    return false;
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