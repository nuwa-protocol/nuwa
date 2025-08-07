import type { 
  SignedSubRAV,
  SubRAV 
} from './types';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { VerificationResult } from '../client/PaymentChannelPayeeClient';
import type { 
  BillingContext,
  CostCalculator,
  BillingRule,
} from '../billing';
import type { ConversionResult } from '../billing/rate/types';

import type { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import { createPendingSubRAVRepo } from '../storage/factories/createPendingSubRAVRepo';
import { HttpPaymentCodec } from '../middlewares/http/HttpPaymentCodec';
import type { ClaimScheduler } from './ClaimScheduler';
import { PaymentUtils } from './PaymentUtils';

  
  /**
   * Configuration for PaymentProcessor
   */
  export interface PaymentProcessorConfig {
    /** Payee client for payment operations */
    payeeClient: PaymentChannelPayeeClient;
    
    /** Billing engine for cost calculation */
    billingEngine: CostCalculator;
    
    /** Service ID for billing configuration */
    serviceId: string;
    
    /** Default asset ID if not provided in request context */
    defaultAssetId?: string;
    
    /** Store for pending unsigned SubRAV proposals */
    pendingSubRAVStore?: PendingSubRAVRepository;
    
    /** Optional claim scheduler for automated claiming */
    claimScheduler?: ClaimScheduler;
    
    /** Debug logging */
    debug?: boolean;
  }
  

  
  /**
 * Payment processing result from PaymentProcessor
 */
export interface ProcessorPaymentResult {
    /** Whether payment was processed successfully */
    success: boolean;
    
    /** Cost calculated for this request */
    cost: bigint;
    
    /** Generated unsigned SubRAV for next request */
    unsignedSubRAV?: SubRAV;
    
    /** Signed SubRAV received from client */
    signedSubRAV?: SignedSubRAV;
    
    /** Whether auto-claim was triggered */
    autoClaimTriggered?: boolean;
    
    /** Whether this was a handshake request */
    isHandshake?: boolean;
    
    /** Error message if failed */
    error?: string;
    
    /** Error code for client handling */
    errorCode?: string;
    
    /** Payer key ID extracted from payment verification */
    payerKeyId?: string;
    
    /** Service transaction reference */
    serviceTxRef?: string;
    
    /** Client transaction reference for request tracking */
    clientTxRef?: string;
    
    /** USD billing conversion details (for auditing) */
    conversion?: ConversionResult;
}
  
  /**
 * Enhanced verification result with payer key ID
 */
export interface PaymentVerificationResult extends VerificationResult {
  payerKeyId?: string;
}
  
  /**
   * Payment processing statistics
   */
  export interface PaymentProcessingStats {
    totalRequests: number;
    successfulPayments: number;
    failedPayments: number;
    handshakes: number;
    autoClaimsTriggered: number;
  }
  
  /**
   * PaymentProcessor - Protocol-agnostic payment negotiation component
   * 
   * This component handles the core payment logic that can be reused across
   * different protocols (HTTP, MCP, A2A, etc.) by abstracting away protocol-specific
   * details and focusing on the deferred payment model implementation.
   */
  export class PaymentProcessor {
    private config: PaymentProcessorConfig;
    private pendingSubRAVStore: PendingSubRAVRepository;
    private stats: PaymentProcessingStats;
  
    constructor(config: PaymentProcessorConfig) {
      this.config = config;
      this.pendingSubRAVStore = config.pendingSubRAVStore || createPendingSubRAVRepo({ backend: 'memory' });
      this.stats = {
        totalRequests: 0,
        successfulPayments: 0,
        failedPayments: 0,
        handshakes: 0,
        autoClaimsTriggered: 0
      };
    }
  
      /**
   * Step A: Pre-process request - complete all I/O operations and verification
   * Returns context with state populated for both pre-flight and post-flight
   */
  async preProcess(ctx: BillingContext): Promise<BillingContext> {
    this.stats.totalRequests++;
    
    this.log('Pre-processing payment for operation:', ctx.meta.operation);

    // Initialize state if not present
    if (!ctx.state) {
      ctx.state = {};
    }

    try {
      let verificationResult: PaymentVerificationResult | undefined;
      let isHandshake = false;
      
      // Extract SignedSubRAV from context
      const signedSubRAV = ctx.meta.signedSubRav;
      
      // Step 1: Verify SignedSubRAV if present (async I/O operations)
      if (signedSubRAV) {
        isHandshake = PaymentUtils.isHandshake(signedSubRAV.subRav);

        if (isHandshake) {
          // Handshake verification
          verificationResult = await this.verifyHandshake(signedSubRAV);
          if (!verificationResult.isValid) {
            this.stats.failedPayments++;
            ctx.state.signedSubRavVerified = false;
            return ctx;
          }
          this.stats.handshakes++;
          this.log('Handshake verified for channel:', signedSubRAV.subRav.channelId);
        } else {
          // Regular payment verification
          verificationResult = await this.confirmDeferredPayment(signedSubRAV);
          if (!verificationResult.isValid) {
            this.stats.failedPayments++;
            ctx.state.signedSubRavVerified = false;
            return ctx;
          }

          // Process the verified payment (persist to RAV store)
          await this.config.payeeClient.processSignedSubRAV(signedSubRAV);
          this.stats.successfulPayments++;
        }
        
        ctx.state.signedSubRavVerified = true;
      } else {
        ctx.state.signedSubRavVerified = true;
      }

      // Step 2: For Pre-flight rules, complete billing immediately
      const rule = ctx.meta.billingRule;
      if (rule && !this.config.billingEngine.isDeferred(rule)) {
        this.log('⚡ Pre-flight rule detected - completing billing in preProcess');
        
        // Calculate cost with async operations
        const costResult = await this.calculateCostWithDetails(ctx, rule);
        const { cost, conversion } = costResult;
        ctx.state.cost = cost;

        // Check maxAmount limit
        if (ctx.meta.maxAmount && ctx.meta.maxAmount > 0n && cost > ctx.meta.maxAmount) {
          this.stats.failedPayments++;
          this.log(`Cost ${cost} exceeds maxAmount ${ctx.meta.maxAmount}`);
          return ctx;
        }

        // Generate SubRAV and header for pre-flight
        const { unsignedSubRAV, clientTxRef, serviceTxRef } = await this.generateSubRAV(ctx, cost, verificationResult);
        
        ctx.state.unsignedSubRav = unsignedSubRAV;
        ctx.state.serviceTxRef = serviceTxRef;
        ctx.state.nonce = unsignedSubRAV.nonce;
        
        // Generate response header
        ctx.state.headerValue = await this.generateResponseHeader(unsignedSubRAV, cost, serviceTxRef, {
          isHandshake,
          autoClaimTriggered: false,
          clientTxRef,
          conversion
        });

        this.log('✅ Pre-flight billing completed in preProcess');
      }

      this.log('✅ Pre-processing completed');
      return ctx;

    } catch (error) {
      this.log('🚨 Pre-processing error:', error);
      if (!ctx.state) ctx.state = {};
      ctx.state.signedSubRavVerified = false;
      return ctx;
    }
  }

  /**
   * Step B & C: Settle billing - lightweight synchronous operations only
   * For Pre-flight: essentially no-op (already completed in preProcess)
   * For Post-flight: calculate cost based on usage and generate header
   */
  settle(ctx: BillingContext, usage?: Record<string, any>): BillingContext {
    this.log('🔄 Settling billing with usage:', usage);

    if (!ctx.state) {
      ctx.state = {};
    }

    // Add usage data to state if provided
    if (usage) {
      ctx.state.usage = usage;
    }

    try {
      const rule = ctx.meta.billingRule;
      
      // For Pre-flight rules, everything should be done already
      if (rule && !this.config.billingEngine.isDeferred(rule)) {
        this.log('⚡ Pre-flight rule - using pre-computed values');
        // All values should already be in ctx.state from preProcess
        if (!ctx.state.headerValue) {
          this.log('⚠️ Pre-flight rule but no header value found in state');
        }
        return ctx;
      }

      // For Post-flight rules, calculate cost based on usage
      if (rule && this.config.billingEngine.isDeferred(rule)) {
        this.log('⏳ Post-flight rule - calculating cost from usage');
        
        // Calculate cost synchronously for known strategy types
        let cost = 0n;
        if (rule.strategy.type === 'PerToken') {
          const unitPricePicoUSD = BigInt(rule.strategy.unitPricePicoUSD || '0');
          const totalTokens = this.extractTokenCountSync(usage || {}, rule.strategy.usageKey || 'usage.total_tokens');
          cost = unitPricePicoUSD * BigInt(totalTokens);
        } else if (rule.strategy.type === 'PerRequest') {
          cost = BigInt(rule.strategy.pricePicoUSD || '0');
        }

        ctx.state.cost = cost;

        // Check maxAmount limit
        if (ctx.meta.maxAmount && ctx.meta.maxAmount > 0n && cost > ctx.meta.maxAmount) {
          this.log(`Cost ${cost} exceeds maxAmount ${ctx.meta.maxAmount}`);
          return ctx;
        }

        // Generate SubRAV and header synchronously
        const { unsignedSubRAV, serviceTxRef, headerValue } = this.generateSubRAVSync(ctx, cost);
        
        ctx.state.unsignedSubRav = unsignedSubRAV;
        ctx.state.serviceTxRef = serviceTxRef;
        ctx.state.nonce = unsignedSubRAV.nonce;
        ctx.state.headerValue = headerValue;

        this.log('✅ Post-flight billing settled successfully');
      }

      return ctx;

    } catch (error) {
      this.log('🚨 Billing settlement error:', error);
      if (!ctx.state) ctx.state = {};
      ctx.state.cost = 0n;
      return ctx;
    }
  }

  /**
   * Step D: Persist billing state to storage
   */
  async persist(ctx: BillingContext): Promise<void> {
    if (!ctx.state?.unsignedSubRav) {
      this.log('⚠️ No unsignedSubRAV to persist');
      return;
    }

    try {
      this.log('💾 Persisting billing state');
      
      // Store the unsigned SubRAV for future verification
      await this.pendingSubRAVStore.save(ctx.state.unsignedSubRav);
      
      // Mark as persisted
      ctx.state.persisted = true;
      
      this.log('✅ Billing state persisted successfully');
    } catch (error) {
      this.log('🚨 Persistence error:', error);
      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use preProcess + settle + persist instead
   */
  async processPayment(
    ctx: BillingContext
  ): Promise<ProcessorPaymentResult> {
      this.stats.totalRequests++;
      
      this.log('Processing payment for operation:', ctx.meta.operation);
  
      try {
        let autoClaimTriggered = false;
        let verificationResult: PaymentVerificationResult | undefined;
        let isHandshake = false;
        
        // Extract SignedSubRAV from context
        const signedSubRAV = ctx.meta.signedSubRav;
        
        // Step 1: If signedSubRAV is provided, verify it (handles previous payment)
        if (signedSubRAV) {
          isHandshake = PaymentUtils.isHandshake(signedSubRAV.subRav);
  
          if (isHandshake) {
            // Handshake verification
            verificationResult = await this.verifyHandshake(signedSubRAV);
            if (!verificationResult.isValid) {
              this.stats.failedPayments++;
              return {
                success: false,
                cost: 0n,
                error: verificationResult.error,
                errorCode: 'INVALID_PAYMENT',
                isHandshake: true
              };
            }
            this.stats.handshakes++;
            this.log('Handshake verified for channel:', signedSubRAV.subRav.channelId);
          } else {
            // Regular payment verification
            verificationResult = await this.confirmDeferredPayment(signedSubRAV);
            if (!verificationResult.isValid) {
              this.stats.failedPayments++;
              return {
                success: false,
                cost: 0n,
                error: verificationResult.error,
                errorCode: this.extractErrorCode(verificationResult.error || ''),
                isHandshake: false
              };
            }
  
            // Process the verified payment
            autoClaimTriggered = await this.processVerifiedPayment(signedSubRAV);
            this.stats.successfulPayments++;
          }
        }
  
        // Step 3: Calculate cost for current request with conversion details
        const preMatchedRule = ctx.meta.billingRule;
        const costResult = await this.calculateCostWithDetails(ctx, preMatchedRule);
        const { cost, conversion } = costResult;

        // Step 3.5: Check if cost exceeds maxAmount limit (only if maxAmount > 0)
        if (ctx.meta.maxAmount && ctx.meta.maxAmount > 0n && cost > ctx.meta.maxAmount) {
          this.stats.failedPayments++;
          return {
            success: false,
            cost,
            error: 'OVER_BUDGET',
            errorCode: 'MAX_AMOUNT_EXCEEDED'
          };
        }

        if (cost === 0n) {
          // Free request, no payment needed
          return {
            success: true,
            cost: 0n,
            autoClaimTriggered,
            isHandshake,
            payerKeyId: verificationResult?.payerKeyId,
            signedSubRAV,
            clientTxRef: ctx.meta.clientTxRef,
            conversion
          };
        }

        // Step 4: Generate unsigned SubRAV proposal for next request
        const unsignedSubRAV = await this.generateProposal(ctx, cost);
        
        // Store the unsigned SubRAV for later verification
        await this.pendingSubRAVStore.save(unsignedSubRAV);

        return {
          success: true,
          cost,
          unsignedSubRAV,
          signedSubRAV,
          autoClaimTriggered,
          isHandshake,
          payerKeyId: verificationResult?.payerKeyId,
          serviceTxRef: PaymentUtils.generateTxRef(),
          clientTxRef: ctx.meta.clientTxRef,
          conversion
        };
  
      } catch (error) {
        this.stats.failedPayments++;
        this.log('Payment processing error:', error);
        
        return {
          success: false,
          cost: 0n,
          error: `Payment processing failed: ${error}`,
          errorCode: 'PAYMENT_ERROR'
        };
      }
    }
  
      /**
   * Verify handshake request (nonce=0, amount=0)
   */
  async verifyHandshake(signedSubRAV: SignedSubRAV): Promise<PaymentVerificationResult> {
      try {
        // Verify SubRAV signature and structure
        const verification = await this.config.payeeClient.verifySubRAV(signedSubRAV);
        
        if (!verification.isValid) {
          return {
            isValid: false,
            error: `Invalid handshake SubRAV signature: ${verification.error}`
          };
        }
  
        // Get channel info to extract payer DID for constructing payerKeyId
        const channelInfo = await this.config.payeeClient.getChannelInfo(signedSubRAV.subRav.channelId);
        const payerKeyId = `${channelInfo.payerDid}#${signedSubRAV.subRav.vmIdFragment}`;
        
        // Process the handshake SubRAV to update PayeeClient state
        await this.config.payeeClient.processSignedSubRAV(signedSubRAV);
        
        return {
          isValid: true,
          payerKeyId
        };
      } catch (error) {
        return {
          isValid: false,
          error: `Handshake verification failed: ${error}`
        };
      }
    }
  
      /**
   * Confirm deferred payment (verify previously generated SubRAV proposal)
   */
  async confirmDeferredPayment(signedSubRAV: SignedSubRAV): Promise<PaymentVerificationResult> {
      try {
        // Check if this SubRAV matches one we previously sent
        const pendingSubRAV = await this.pendingSubRAVStore.find(
          signedSubRAV.subRav.channelId,
          signedSubRAV.subRav.nonce
        );
        
        if (!pendingSubRAV) {
          return {
            isValid: false,
            error: `SubRAV not found in pending list: ${signedSubRAV.subRav.channelId}:${signedSubRAV.subRav.nonce}`
          };
        }
  
        // Verify that the signed SubRAV matches our pending unsigned SubRAV
        if (!PaymentUtils.subRAVsMatch(pendingSubRAV, signedSubRAV.subRav)) {
          return {
            isValid: false,
            error: `Signed SubRAV does not match pending SubRAV: ${signedSubRAV.subRav.channelId}:${signedSubRAV.subRav.nonce}`
          };
        }
  
        // Verify SubRAV signature and structure
        const verification = await this.config.payeeClient.verifySubRAV(signedSubRAV);
        
        if (!verification.isValid) {
          return {
            isValid: false,
            error: `Invalid SubRAV signature: ${verification.error}`
          };
        }
  
        // Payment verified successfully, remove from pending list
        await this.pendingSubRAVStore.remove(signedSubRAV.subRav.channelId, signedSubRAV.subRav.nonce);
        
        // Get channel info to extract payer DID for constructing payerKeyId
        const channelInfo = await this.config.payeeClient.getChannelInfo(signedSubRAV.subRav.channelId);
        const payerKeyId = `${channelInfo.payerDid}#${signedSubRAV.subRav.vmIdFragment}`;
        
        return {
          isValid: true,
          payerKeyId
        };
      } catch (error) {
        return {
          isValid: false,
          error: `Payment verification failed: ${error}`
        };
      }
    }
  
    /**
     * Generate SubRAV proposal for client to sign
     */
    async generateProposal(context: BillingContext, amount: bigint): Promise<SubRAV> {
      const signedSubRav = context.meta.signedSubRav;
      
      if (!signedSubRav) {
        throw new Error('SignedSubRAV is required for SubRAV generation');
      }
      
      const channelId = signedSubRav.subRav.channelId;
      const vmIdFragment = signedSubRav.subRav.vmIdFragment;
  
      // Get channel info to construct proper payer key ID
      const channelInfo = await this.config.payeeClient.getChannelInfo(channelId);
      const payerKeyId = `${channelInfo.payerDid}#${vmIdFragment}`;
  
      return await this.config.payeeClient.generateSubRAV({
        channelId,
        payerKeyId,
        amount,
        description: `${context.meta.operation} - ${this.config.serviceId}`
      });
    }
  
    /**
     * Process verified payment and optionally trigger claim
     */
    private async processVerifiedPayment(signedSubRAV: SignedSubRAV): Promise<boolean> {
      try {
        // Process the signed SubRAV - this persists to RAVStore automatically
        await this.config.payeeClient.processSignedSubRAV(signedSubRAV);
  
        const channelId = signedSubRAV.subRav.channelId;
        const vmIdFragment = signedSubRAV.subRav.vmIdFragment;
        
        // If ClaimScheduler is configured, optionally trigger immediate claim
        if (this.config.claimScheduler) {
          try {
            const results = await this.config.claimScheduler.triggerClaim(channelId, vmIdFragment);
            if (results.length > 0) {
              this.log(`ClaimScheduler processed ${results.length} claims for channel ${channelId}`);
              this.stats.autoClaimsTriggered++;
              return true;
            }
          } catch (error) {
            this.log('ClaimScheduler trigger failed (non-fatal):', error);
            // Continue - this is not a critical error
          }
        }
  
        return false;
      } catch (error) {
        this.log('Payment processing error:', error);
        throw error;
      }
    }
  

    /**
     * Calculate cost with conversion details (USD billing)
     */
    private async calculateCostWithDetails(context: BillingContext, preMatchedRule?: BillingRule): Promise<{cost: bigint, conversion?: ConversionResult}> {
      try {
        let cost: bigint;
        
        if (preMatchedRule) {
          // Use pre-matched rule to avoid duplicate rule matching (V2 optimization)
          cost = await this.config.billingEngine.calcCostByRule(context, preMatchedRule);
        } else {
          // Fallback to standard method
          cost = await this.config.billingEngine.calcCost(context);
        }
        
        return { cost };
      } catch (error) {
        this.log('Billing calculation error:', error);
        throw new Error(`Failed to calculate cost: ${error}`);
      }
    }
  
    /**
     * Extract error code from error message
     */
    private extractErrorCode(error: string): string {
      return PaymentUtils.extractErrorCode(error);
    }
  
    /**
     * Clear expired pending SubRAV proposals
     */
    async clearExpiredProposals(maxAgeMinutes: number = 30): Promise<number> {
      const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
      const clearedCount = await this.pendingSubRAVStore.cleanup(maxAge);
      
      this.log(`Cleared ${clearedCount} expired pending SubRAV proposals (older than ${maxAgeMinutes} minutes)`);
      return clearedCount;
    }
  
    /**
     * Get payment processing statistics
     */
    getProcessingStats(): PaymentProcessingStats {
      return { ...this.stats };
    }
  
    /**
     * Find pending SubRAV proposal by channel and nonce
     */
    async findPendingProposal(channelId: string, nonce: bigint): Promise<SubRAV | null> {
      return await this.pendingSubRAVStore.find(channelId, nonce);
    }

    /**
     * Find the latest pending SubRAV proposal for a channel (for recovery scenarios)
     */
    async findLatestPendingProposal(channelId: string): Promise<SubRAV | null> {
      return await this.pendingSubRAVStore.findLatestByChannel(channelId);
    }
  
    /**
     * Generate unsigned SubRAV for the response
     */
    private async generateSubRAV(
      ctx: BillingContext, 
      cost: bigint, 
      verificationResult?: PaymentVerificationResult
    ): Promise<{ unsignedSubRAV: SubRAV; clientTxRef: string; serviceTxRef: string }> {
      const signedSubRAV = ctx.meta.signedSubRav;
      const serviceTxRef = `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const clientTxRef = ctx.meta.clientTxRef || crypto.randomUUID();

      if (signedSubRAV) {
        // Generate follow-up SubRAV
        const channelId = signedSubRAV.subRav.channelId;
        const vmIdFragment = signedSubRAV.subRav.vmIdFragment;
        const currentNonce = signedSubRAV.subRav.nonce;
        const nextNonce = currentNonce + 1n;
        const newAccumulatedAmount = signedSubRAV.subRav.accumulatedAmount + cost;

        const unsignedSubRAV: SubRAV = {
          version: 1,
          chainId: signedSubRAV.subRav.chainId,
          channelId,
          channelEpoch: signedSubRAV.subRav.channelEpoch,
          vmIdFragment,
          nonce: nextNonce,
          accumulatedAmount: newAccumulatedAmount
        };

        return { unsignedSubRAV, clientTxRef, serviceTxRef };
      } else {
        // This should be a handshake - generate handshake SubRAV
        throw new Error('Cannot generate SubRAV without existing channel context');
      }
    }

    /**
     * Generate response header with payment information
     */
    private async generateResponseHeader(
      unsignedSubRAV: SubRAV,
      cost: bigint,
      serviceTxRef: string,
      options: {
        isHandshake?: boolean;
        autoClaimTriggered?: boolean;
        clientTxRef?: string;
        conversion?: any;
      }
    ): Promise<string> {
      try {
        // Import HttpPaymentCodec dynamically to avoid circular dependencies
        const { HttpPaymentCodec } = await import('../middlewares/http/HttpPaymentCodec');
        
        const codec = new HttpPaymentCodec();
        return codec.encodeResponse(
          unsignedSubRAV,
          cost,
          serviceTxRef,
          {
            isHandshake: options.isHandshake,
            autoClaimTriggered: options.autoClaimTriggered,
            clientTxRef: options.clientTxRef
          }
        );
      } catch (error) {
        this.log('🚨 Failed to generate response header:', error);
        throw error;
      }
    }

    /**
     * Generate SubRAV and header synchronously for post-flight billing
     */
    private generateSubRAVSync(ctx: BillingContext, cost: bigint): {
      unsignedSubRAV: SubRAV;
      serviceTxRef: string;
      headerValue: string;
    } {
      const signedSubRAV = ctx.meta.signedSubRav;
      const serviceTxRef = `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const clientTxRef = ctx.meta.clientTxRef || crypto.randomUUID();

      if (!signedSubRAV) {
        throw new Error('Cannot generate SubRAV without existing channel context');
      }

      // Generate follow-up SubRAV
      const channelId = signedSubRAV.subRav.channelId;
      const vmIdFragment = signedSubRAV.subRav.vmIdFragment;
      const currentNonce = signedSubRAV.subRav.nonce;
      const nextNonce = currentNonce + 1n;
      const newAccumulatedAmount = signedSubRAV.subRav.accumulatedAmount + cost;

      const unsignedSubRAV: SubRAV = {
        version: 1,
        chainId: signedSubRAV.subRav.chainId,
        channelId,
        channelEpoch: signedSubRAV.subRav.channelEpoch,
        vmIdFragment,
        nonce: nextNonce,
        accumulatedAmount: newAccumulatedAmount
      };

      // Generate header using HttpPaymentCodec
      const responsePayload = {
        subRav: unsignedSubRAV,
        amountDebited: cost,
        clientTxRef: clientTxRef,
        serviceTxRef: serviceTxRef,
        errorCode: 0,
        message: 'Post-flight billing completed'
      };

      // Use HttpPaymentCodec to generate header
      const headerValue = HttpPaymentCodec.buildResponseHeader(responsePayload);

      return { unsignedSubRAV, serviceTxRef, headerValue };
    }

    /**
     * Extract token count from usage data synchronously
     */
    private extractTokenCountSync(usage: any, usageKey: string): number {
      try {
        // usageKey format: "usage.total_tokens"
        const keys = usageKey.split('.');
        let value = usage;
        for (const key of keys) {
          value = value[key];
          if (value === undefined) {
            return 0;
          }
        }
        return typeof value === 'number' ? value : parseInt(value) || 0;
      } catch {
        return 0;
      }
    }

    /**
     * Debug logging
     */
    private log(...args: any[]): void {
      if (this.config.debug) {
        console.log('[PaymentProcessor]', ...args);
      }
    }
  } 