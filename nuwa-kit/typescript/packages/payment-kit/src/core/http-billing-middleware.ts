/**
 * Enhanced HTTP Payment Middleware with Deferred Payment Model
 * 
 * This middleware implements a deferred payment model for HTTP services:
 * 1. Client makes request
 * 2. Server responds with business data + unsigned SubRAV proposal
 * 3. Client signs the SubRAV from previous response and includes it in next request
 * 
 * This reduces round-trips and improves UX by not blocking the initial response.
 */

import type { 
  HttpRequestPayload, 
  HttpResponsePayload, 
  SignedSubRAV,
  SubRAV 
} from './types';
import { HttpHeaderCodec } from './http-header';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { 
  BillingContext,
  CostCalculator
} from '../billing/types';
import { BillingEngine } from '../billing/engine';
import { UsdBillingEngine } from '../billing/usd-engine';

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
 * Configuration for the HTTP payment middleware
 */
export interface HttpPaymentMiddlewareConfig {
  /** Payee client for payment operations */
  payeeClient: PaymentChannelPayeeClient;
  /** Billing engine for cost calculation */
  billingEngine: CostCalculator;
  /** Service ID for billing configuration */
  serviceId: string;
  /** Default asset ID if not provided in request context */
  defaultAssetId?: string;
  /** Whether to require payment for all requests */
  requirePayment?: boolean;
  /** Minimum amount threshold for automatic claims (in asset units) */
  autoClaimThreshold?: bigint;
  /** Maximum nonce difference before auto-claim */
  autoClaimNonceThreshold?: number;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Request context with billing metadata
 */
export interface BillingRequestContext {
  /** HTTP path */
  path?: string;
  /** HTTP method */
  method?: string;
  /** Model name for AI services */
  model?: string;
  /** Asset ID for settlement */
  assetId?: string;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Payment processing result
 */
export interface PaymentProcessingResult {
  /** Whether payment was processed successfully */
  success: boolean;
  /** Cost calculated for this request */
  cost: bigint;
  /** Asset ID used for calculation */
  assetId: string;
  /** Generated or received SubRAV */
  subRav?: SubRAV;
  /** Signed SubRAV from client */
  signedSubRav?: SignedSubRAV;
  /** Whether auto-claim was triggered */
  autoClaimTriggered?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Enhanced HTTP Payment Middleware with Deferred Payment Model
 */
export class HttpBillingMiddleware {
  private config: HttpPaymentMiddlewareConfig;
  private pendingClaims = new Map<string, SignedSubRAV[]>(); // channelId -> pending SubRAVs
  private pendingSubRAVs = new Map<string, SubRAV>(); // "channelId:nonce" -> pending unsigned SubRAV

  constructor(config: HttpPaymentMiddlewareConfig) {
    this.config = config;
  }

  /**
   * Create Express middleware function
   */
  createExpressMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await this.processPayment(req, res);
        
        if (!result.success) {
          // Determine appropriate HTTP status code based on error type
          let statusCode = 402; // Payment Required (default)
          let errorCode = 'PAYMENT_REQUIRED';
          
          if (result.error?.includes('Payment verification failed')) {
            statusCode = 400; // Bad Request for invalid payment
            errorCode = 'INVALID_PAYMENT';
          } else if (result.error?.includes('not found in pending list')) {
            statusCode = 400; // Bad Request for unknown SubRAV
            errorCode = 'UNKNOWN_SUBRAV';
          } else if (result.error?.includes('does not match')) {
            statusCode = 400; // Bad Request for tampered SubRAV
            errorCode = 'TAMPERED_SUBRAV';
          }
          
          return res.status(statusCode).json({ 
            error: result.error || 'Payment required',
            code: errorCode,
            assetId: result.assetId
          });
        }

        // Attach billing result to request for downstream handlers
        (req as any).paymentResult = result;
        
        next();
      } catch (error) {
        this.log('Payment processing error:', error);
        res.status(500).json({ 
          error: 'Payment processing failed',
          code: 'PAYMENT_ERROR'
        });
      }
    };
  }

  /**
   * Process payment for a request using deferred payment model
   */
  async processPayment(req: Request, res: Response): Promise<PaymentProcessingResult> {
    // Step 1: Process any payment from previous request
    const paymentData = this.extractPaymentData(req.headers as Record<string, string>);
    let autoClaimTriggered = false;
    
    if (paymentData) {
      // Verify and process payment for previous request
      const verificationResult = await this.verifyDeferredPayment(paymentData);
      if (!verificationResult.success) {
        // SECURITY: Payment verification failed - reject the request immediately
        this.log('Payment verification failed for previous request:', verificationResult.error);
        return {
          success: false,
          cost: 0n,
          assetId: verificationResult.assetId,
          error: `Payment verification failed: ${verificationResult.error}`
        };
      } else {
        autoClaimTriggered = await this.processVerifiedPayment(paymentData);
      }
    }

    // Step 2: Calculate cost for current request
    const billingContext = this.buildBillingContext(req);
    const cost = await this.calculateCost(billingContext);
    
    if (cost === 0n && !this.config.requirePayment) {
      // Free request, no payment needed
      return {
        success: true,
        cost: 0n,
        assetId: billingContext.assetId || this.config.defaultAssetId || 'unknown',
        autoClaimTriggered
      };
    }

    // Step 3: Generate unsigned SubRAV for current request
    const subRav = await this.generateSubRAVProposal(billingContext, cost);
    
    // Store the unsigned SubRAV for later verification using channelId:nonce as key
    const subRAVKey = `${subRav.channelId}:${subRav.nonce}`;
    this.pendingSubRAVs.set(subRAVKey, subRav);
    
    // Step 4: Add SubRAV to response (client will sign and send in next request)
    const responsePayload: HttpResponsePayload = {
      subRav, // Unsigned SubRAV for client to sign
      amountDebited: cost,
      serviceTxRef: this.generateTxRef(),
      errorCode: 0, // Success
      message: 'Payment proposal for next request'
    };

    this.addPaymentDataToResponse(res, responsePayload);

    return {
      success: true,
      cost,
      assetId: billingContext.assetId || this.config.defaultAssetId || 'unknown',
      subRav,
      autoClaimTriggered
    };
  }

  /**
   * Extract payment data from request headers
   */
  private extractPaymentData(headers: Record<string, string>): HttpRequestPayload | null {
    const headerValue = headers[HttpHeaderCodec.getHeaderName().toLowerCase()] || 
                       headers[HttpHeaderCodec.getHeaderName()];
    
    if (!headerValue) {
      return null;
    }

    try {
      return HttpHeaderCodec.parseRequestHeader(headerValue);
    } catch (error) {
      throw new Error(`Invalid payment channel header: ${error}`);
    }
  }

  /**
   * Build billing context from request
   */
  private buildBillingContext(req: Request): BillingContext {
    const meta: BillingRequestContext = {
      path: req.path,
      method: req.method,
      // Extract additional metadata from query/body
      ...req.query,
      ...(req.body && typeof req.body === 'object' ? req.body : {})
    };

    return {
      serviceId: this.config.serviceId,
      operation: `${req.method.toLowerCase()}:${req.path}`,
      assetId: meta.assetId || this.config.defaultAssetId,
      meta
    };
  }

  /**
   * Calculate cost using billing engine
   */
  private async calculateCost(context: BillingContext): Promise<bigint> {
    try {
      return await this.config.billingEngine.calcCost(context);
    } catch (error) {
      this.log('Billing calculation error:', error);
      throw new Error(`Failed to calculate cost: ${error}`);
    }
  }

  /**
   * Generate SubRAV proposal for client
   */
  private async generateSubRAVProposal(
    context: BillingContext, 
    amount: bigint
  ): Promise<SubRAV> {
    if (!context.assetId) {
      throw new Error('assetId is required for SubRAV generation');
    }

    // For proposal, we need to determine the channel and payer
    // This might need to be enhanced based on how channel discovery works
    const channelId = context.meta.channelId || 'pending'; // Placeholder
    const payerKeyId = context.meta.payerKeyId || 'unknown'; // Placeholder

    return await this.config.payeeClient.generateSubRAV({
      channelId,
      payerKeyId,
      amount,
      description: `${context.operation} - ${this.config.serviceId}`
    });
  }

  /**
   * Check if two SubRAVs match (ignoring signature)
   */
  private subRAVsMatch(subRAV1: SubRAV, subRAV2: SubRAV): boolean {
    return (
      subRAV1.version === subRAV2.version &&
      subRAV1.chainId === subRAV2.chainId &&
      subRAV1.channelId === subRAV2.channelId &&
      subRAV1.channelEpoch === subRAV2.channelEpoch &&
      subRAV1.vmIdFragment === subRAV2.vmIdFragment &&
      subRAV1.accumulatedAmount === subRAV2.accumulatedAmount &&
      subRAV1.nonce === subRAV2.nonce
    );
  }

  /**
   * Verify deferred payment from client (payment for previous request)
   */
  private async verifyDeferredPayment(
    paymentData: HttpRequestPayload
  ): Promise<PaymentProcessingResult> {
    try {
      const signedSubRAV = paymentData.signedSubRav;
      const subRAVKey = `${signedSubRAV.subRav.channelId}:${signedSubRAV.subRav.nonce}`;
      
      // Check if this SubRAV matches one we previously sent
      const pendingSubRAV = this.pendingSubRAVs.get(subRAVKey);
      if (!pendingSubRAV) {
        return {
          success: false,
          cost: 0n,
          assetId: signedSubRAV.subRav.channelId,
          error: `SubRAV not found in pending list: ${subRAVKey}`
        };
      }

      // Verify that the signed SubRAV matches our pending unsigned SubRAV
      if (!this.subRAVsMatch(pendingSubRAV, signedSubRAV.subRav)) {
        return {
          success: false,
          cost: 0n,
          assetId: signedSubRAV.subRav.channelId,
          error: `Signed SubRAV does not match pending SubRAV: ${subRAVKey}`
        };
      }

      // Verify SubRAV signature and structure
      const verification = await this.config.payeeClient.verifySubRAV(signedSubRAV);
      
      if (!verification.isValid) {
        return {
          success: false,
          cost: 0n,
          assetId: signedSubRAV.subRav.channelId,
          error: `Invalid SubRAV signature: ${verification.error}`
        };
      }

      // Payment verified successfully, remove from pending list
      this.pendingSubRAVs.delete(subRAVKey);
      
      return {
        success: true,
        cost: signedSubRAV.subRav.accumulatedAmount,
        assetId: signedSubRAV.subRav.channelId,
        signedSubRav: signedSubRAV
      };
    } catch (error) {
      return {
        success: false,
        cost: 0n,
        assetId: 'unknown',
        error: `Payment verification failed: ${error}`
      };
    }
  } 

  /**
   * Process verified payment and handle auto-claim logic
   */
  private async processVerifiedPayment(paymentData: HttpRequestPayload): Promise<boolean> {
    try {
      // Process the signed SubRAV
      await this.config.payeeClient.processSignedSubRAV(paymentData.signedSubRav);

      const channelId = paymentData.channelId;
      
      // Add to pending claims
      if (!this.pendingClaims.has(channelId)) {
        this.pendingClaims.set(channelId, []);
      }
      this.pendingClaims.get(channelId)!.push(paymentData.signedSubRav);

      // Check auto-claim conditions
      return await this.checkAndTriggerAutoClaim(channelId);
    } catch (error) {
      this.log('Payment processing error:', error);
      throw error;
    }
  }

  /**
   * Check and trigger automatic claims based on thresholds
   */
  private async checkAndTriggerAutoClaim(channelId: string): Promise<boolean> {
    const pendingSubRAVs = this.pendingClaims.get(channelId) || [];
    
    if (pendingSubRAVs.length === 0) {
      return false;
    }

    const shouldClaim = this.shouldTriggerAutoClaim(pendingSubRAVs);
    
    if (shouldClaim) {
      try {
        // Claim the latest (highest) SubRAV
        const latestSubRAV = this.getLatestSubRAV(pendingSubRAVs);
        await this.config.payeeClient.claimFromChannel({ 
          signedSubRAV: latestSubRAV,
          validateBeforeClaim: false // Already validated
        });

        // Clear pending claims for this channel
        this.pendingClaims.delete(channelId);
        
        this.log(`Auto-claim triggered for channel ${channelId}`);
        return true;
      } catch (error) {
        this.log('Auto-claim failed:', error);
        // Don't clear pending claims on failure, retry later
      }
    }

    return false;
  }

  /**
   * Determine if auto-claim should be triggered
   */
  private shouldTriggerAutoClaim(pendingSubRAVs: SignedSubRAV[]): boolean {
    if (pendingSubRAVs.length === 0) {
      return false;
    }

    const latest = this.getLatestSubRAV(pendingSubRAVs);
    
    // Check nonce threshold
    if (this.config.autoClaimNonceThreshold && 
        pendingSubRAVs.length >= this.config.autoClaimNonceThreshold) {
      return true;
    }

    // Check amount threshold
    if (this.config.autoClaimThreshold && 
        latest.subRav.accumulatedAmount >= this.config.autoClaimThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Get the latest SubRAV (highest nonce)
   */
  private getLatestSubRAV(subRAVs: SignedSubRAV[]): SignedSubRAV {
    return subRAVs.reduce((latest, current) => 
      current.subRav.nonce > latest.subRav.nonce ? current : latest
    );
  }

  /**
   * Add payment data to response headers
   */
  private addPaymentDataToResponse(res: Response, payload: HttpResponsePayload): void {
    const headerValue = HttpHeaderCodec.buildResponseHeader(payload);
    res.setHeader(HttpHeaderCodec.getHeaderName(), headerValue);
  }

  /**
   * Generate transaction reference
   */
  private generateTxRef(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
   * Static factory method for creating middleware with billing engine
   */
  static create(config: HttpPaymentMiddlewareConfig): HttpBillingMiddleware {
    return new HttpBillingMiddleware(config);
  }

  /**
   * Static factory method for creating middleware with custom billing engine
   */
  static createWithBillingEngine(
    payeeClient: PaymentChannelPayeeClient,
    billingEngine: CostCalculator,
    serviceId: string,
    options: Partial<HttpPaymentMiddlewareConfig> = {}
  ): HttpBillingMiddleware {
    return new HttpBillingMiddleware({
      payeeClient,
      billingEngine,
      serviceId,
      ...options
    });
  }

  /**
   * Static factory method for creating middleware with standard billing engine
   */
  static createWithStandardBilling(
    payeeClient: PaymentChannelPayeeClient,
    configLoader: any, // ConfigLoader from billing system
    serviceId: string,
    options: Partial<HttpPaymentMiddlewareConfig> = {}
  ): HttpBillingMiddleware {
    const billingEngine = new BillingEngine(configLoader);
    return new HttpBillingMiddleware({
      payeeClient,
      billingEngine,
      serviceId,
      ...options
    });
  }

  /**
   * Static factory method for creating middleware with USD billing
   */
  static createWithUsdBilling(
    payeeClient: PaymentChannelPayeeClient,
    configLoader: any, // ConfigLoader from billing system
    rateProvider: any, // RateProvider from billing system
    serviceId: string,
    options: Partial<HttpPaymentMiddlewareConfig> = {}
  ): HttpBillingMiddleware {
    const usdBillingEngine = new UsdBillingEngine(configLoader, rateProvider);
    return new HttpBillingMiddleware({
      payeeClient,
      billingEngine: usdBillingEngine,
      serviceId,
      ...options
    });
  }

  /**
   * Get pending claims statistics
   */
  getPendingClaimsStats(): Record<string, { count: number; totalAmount: bigint }> {
    const stats: Record<string, { count: number; totalAmount: bigint }> = {};
    
    for (const [channelId, subRAVs] of this.pendingClaims.entries()) {
      const latest = subRAVs.length > 0 ? this.getLatestSubRAV(subRAVs) : null;
      stats[channelId] = {
        count: subRAVs.length,
        totalAmount: latest?.subRav.accumulatedAmount || 0n
      };
    }
    
    return stats;
  }

  /**
   * Manually trigger claims for a channel
   */
  async manualClaim(channelId: string): Promise<boolean> {
    return await this.checkAndTriggerAutoClaim(channelId);
  }

  /**
   * Clear pending claims for a channel (useful for cleanup)
   */
  clearPendingClaims(channelId?: string): void {
    if (channelId) {
      this.pendingClaims.delete(channelId);
    } else {
      this.pendingClaims.clear();
    }
  }

  /**
   * Get pending SubRAVs statistics
   */
  getPendingSubRAVsStats(): Record<string, { channelId: string; nonce: bigint; amount: bigint }> {
    const stats: Record<string, { channelId: string; nonce: bigint; amount: bigint }> = {};
    
    for (const [key, subRAV] of this.pendingSubRAVs.entries()) {
      stats[key] = {
        channelId: subRAV.channelId,
        nonce: subRAV.nonce,
        amount: subRAV.accumulatedAmount
      };
    }
    
    return stats;
  }

  /**
   * Clear expired pending SubRAVs (older than specified minutes)
   */
  clearExpiredPendingSubRAVs(maxAgeMinutes: number = 30): number {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    let clearedCount = 0;

    // Note: In a real implementation, you'd want to store timestamps with SubRAVs
    // For now, we'll just provide the interface
    this.log(`Cleared ${clearedCount} expired pending SubRAVs (older than ${maxAgeMinutes} minutes)`);
    return clearedCount;
  }

  /**
   * Security: Get suspicious activity metrics
   */
  getSuspiciousActivityStats(): {
    unknownSubRAVs: number;
    tamperedSubRAVs: number;
    invalidSignatures: number;
  } {
    // In production, you'd track these metrics
    // For now, return placeholder stats
    return {
      unknownSubRAVs: 0,
      tamperedSubRAVs: 0,
      invalidSignatures: 0
    };
  }

  /**
   * Security: Check if a client should be rate-limited based on failed payments
   */
  shouldRateLimit(clientId: string): boolean {
    // In production, implement rate limiting logic here
    // Track failed payment attempts per client
    return false;
  }

  /**
   * Find pending SubRAV by channel and nonce
   */
  findPendingSubRAV(channelId: string, nonce: bigint): SubRAV | null {
    const key = `${channelId}:${nonce}`;
    return this.pendingSubRAVs.get(key) || null;
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