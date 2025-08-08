import type { 
  SignedSubRAV,
  SubRAV 
} from './types';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { VerificationResult } from '../client/PaymentChannelPayeeClient';
import type { 
  BillingContext,
} from '../billing';
import { getStrategy } from '../billing/core/strategy-registry';
import { convertUsdToAssetUsingPrice } from '../billing/core/converter';
import type { RateProvider, RateResult } from '../billing/rate/types';
// Ensure built-in strategies are registered
import '../billing/strategies';
import type { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import { createPendingSubRAVRepo } from '../storage/factories/createPendingSubRAVRepo';
import { HttpPaymentCodec } from '../middlewares/http/HttpPaymentCodec';
import type { ClaimScheduler } from './ClaimScheduler';
import { PaymentUtils } from './PaymentUtils';
import { deriveChannelId } from '../rooch/ChannelUtils';

  
  /**
   * Configuration for PaymentProcessor
   */
  export interface PaymentProcessorConfig {
    /** Payee client for payment operations */
    payeeClient: PaymentChannelPayeeClient;
    
    /** Service ID for billing configuration */
    serviceId: string;

    /** Rate provider for asset conversion */
    rateProvider: RateProvider;
    
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
      // Step 1: Check pending proposal priority (§4.1 of rav-handling.md)
      this.log('🔍 Checking pending proposal priority for operation:', ctx.meta.operation);
      const pendingCheckResult = await this.checkPendingProposalPriority(ctx);
      if (pendingCheckResult.shouldReturnEarly) {
        this.log('⚠️ Returning early from preProcess due to pending proposal check');
        return ctx;
      }
      this.log('✅ Pending proposal check passed, continuing with normal processing');

      // Extract SignedSubRAV from context
      const signedSubRAV = ctx.meta.signedSubRav;

      if (signedSubRAV) {
        const verification = await this.confirmDeferredPayment(signedSubRAV);
        if (!verification.isValid) {
          this.stats.failedPayments++;
          ctx.state.signedSubRavVerified = false;
          return ctx;
        } else {
          this.stats.successfulPayments++;
        }
        ctx.state.signedSubRavVerified = true;
      } else {
        ctx.state.signedSubRavVerified = true;
      }

      // Step 2: Prefetch exchange rate only (no cost calculation here)
      if (ctx.assetId) {
        try {
          const price = await this.config.rateProvider.getPricePicoUSD(ctx.assetId);
          const timestamp = this.config.rateProvider.getLastUpdated(ctx.assetId) ?? Date.now();
          const exchangeRate: RateResult = {
            price,
            timestamp,
            provider: 'rate-provider',
            assetId: ctx.assetId,
          };
          ctx.state.exchangeRate = exchangeRate;
        } catch (e) {
          ctx.state.error = { code: 'RATE_FETCH_FAILED', message: String(e) } as any;
        }
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
  settle(ctx: BillingContext, units?: number): BillingContext {
    this.log('🔄 Settling billing with units:', units);

    if (!ctx.state) {
      ctx.state = {};
    }

    // Settling uses numeric units; no structured usage is attached to state

    try {
      const rule = ctx.meta.billingRule;

      // If a protocol-level error was set during preProcess or earlier, generate error header now
      if (ctx.state?.error) {
        try {
          const errorPayload = {
            error: ctx.state.error,
            clientTxRef: ctx.meta.clientTxRef,
            serviceTxRef: ctx.state.serviceTxRef,
            version: 1
          } as any;
          ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader(errorPayload);
        } catch (e) {
          this.log('Failed to build error header:', e);
        }
        return ctx;
      }
      
      // Unified synchronous calculation for both pre-flight and post-flight
      if (rule) {
        this.log('📊 Processing billing rule:', rule.id, 'paymentRequired:', rule.paymentRequired);
        const usageUnits = Number.isFinite(units) && (units as number) > 0 ? Math.floor(units as number) : 1;

        // Strict requirement: clientTxRef must be present to allow client-side resolution
        if (!ctx.meta.clientTxRef) {
          const err = { code: 'CLIENT_TX_REF_MISSING', message: 'clientTxRef is required in request header' } as any;
          ctx.state.error = err;
          try {
            const errorPayload = {
              error: err,
              clientTxRef: undefined,
            serviceTxRef: ctx.state.serviceTxRef,
            version: 1
          } as any;
            ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader(errorPayload);
          } catch (e) {
            this.log('Failed to build error header:', e);
        }
        return ctx;
      }

        const strategy = getStrategy(rule);
        const usdCost = strategy.evaluate(ctx, usageUnits);

        // Convert to asset units if asset settlement is requested
        let finalCost = usdCost;
        if (ctx.assetId) {
          const rate = ctx.state.exchangeRate;
          if (!rate) {
            // Missing rate is a hard error as required
            const err = { code: 'RATE_NOT_AVAILABLE', message: `Missing exchange rate for asset ${ctx.assetId}` } as any;
            ctx.state.error = err;
            try {
              const errorPayload = {
                error: err,
                clientTxRef: ctx.meta.clientTxRef,
                serviceTxRef: ctx.state.serviceTxRef,
                version: 1
              } as any;
              ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader(errorPayload);
            } catch (e) {
              this.log('Failed to build error header:', e);
            }
            return ctx;
          }
          const conversion = convertUsdToAssetUsingPrice(usdCost, rate);
          finalCost = conversion.assetCost;
        }

        ctx.state.cost = finalCost;

        // Check maxAmount limit
        if (ctx.meta.maxAmount && ctx.meta.maxAmount > 0n && finalCost > ctx.meta.maxAmount) {
          this.log(`Cost ${finalCost} exceeds maxAmount ${ctx.meta.maxAmount}`);
          const err = { code: 'MAX_AMOUNT_EXCEEDED', message: `Cost ${finalCost} exceeds maxAmount ${ctx.meta.maxAmount}` } as any;
          ctx.state.error = err;
          // Build error header now
          try {
            const errorPayload = {
              error: err,
              clientTxRef: ctx.meta.clientTxRef,
              serviceTxRef: ctx.state.serviceTxRef,
              version: 1
            } as any;
            ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader(errorPayload);
          } catch (e) {
            this.log('Failed to build error header:', e);
          }
          return ctx;
        }

        // Special handling for free routes (§4.3 of rav-handling.md)
        if (rule.paymentRequired === false) {
          // Free route: if client sent SignedSubRAV, verify but don't generate unsigned
          if (ctx.meta.signedSubRav && finalCost === 0n) {
            this.log('📝 Free route with SignedSubRAV - verified but not generating unsigned SubRAV');
            // Set minimal response state for free routes
            ctx.state.cost = finalCost;
            // Don't generate unsignedSubRav or headerValue for free routes
          } else if (ctx.meta.signedSubRav && finalCost > 0n) {
            // This shouldn't happen - free routes should have cost=0
            this.log('⚠️ Free route with non-zero cost:', finalCost);
            const err = { code: 'BILLING_CONFIG_ERROR', message: `Free route has non-zero cost: ${finalCost}` } as any;
            ctx.state.error = err;
            try {
              const errorPayload = {
                error: err,
                clientTxRef: ctx.meta.clientTxRef,
                serviceTxRef: ctx.state.serviceTxRef,
                version: 1
              } as any;
              ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader(errorPayload);
            } catch (e) {
              this.log('Failed to build error header:', e);
            }
            return ctx;
          } else {
            // Free route without SignedSubRAV - normal free processing
            this.log('📝 Free route without SignedSubRAV - no payment processing needed');
            ctx.state.cost = finalCost;
          }
        } else {
          // Paid route: always generate SubRAV and header (even if cost=0 per §4.2)
          const { unsignedSubRAV, serviceTxRef, headerValue } = this.generateSubRAVSync(ctx, finalCost);
        ctx.state.unsignedSubRav = unsignedSubRAV;
        ctx.state.serviceTxRef = serviceTxRef;
        ctx.state.nonce = unsignedSubRAV.nonce;
        ctx.state.headerValue = headerValue;
        }

        this.log('✅ Billing settled successfully');
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
      // Ensure clientTxRef is persisted back to context for consistent echoing
      if (!ctx.meta.clientTxRef) {
        ctx.meta.clientTxRef = clientTxRef;
      }

      if (!signedSubRAV) {
        throw new Error('Cannot generate SubRAV without existing channel context');
      }

      const unsignedSubRAV = this.buildFollowUpUnsigned(signedSubRAV, cost);

      // Generate header using HttpPaymentCodec (new payload shape)
      const responsePayload = {
        subRav: unsignedSubRAV,
        cost,
        clientTxRef,
        serviceTxRef,
        version: 1
      } as any;

      const headerValue = HttpPaymentCodec.buildResponseHeader(responsePayload);

      return { unsignedSubRAV, serviceTxRef, headerValue };
    }




  /**
   * Build next unsigned SubRAV following the prior signed SubRAV, reused by async/sync paths.
   */
  private buildFollowUpUnsigned(signedSubRAV: SignedSubRAV, cost: bigint): SubRAV {
    const channelId = signedSubRAV.subRav.channelId;
    const vmIdFragment = signedSubRAV.subRav.vmIdFragment;
    const currentNonce = signedSubRAV.subRav.nonce;
    const nextNonce = currentNonce + 1n;
    const newAccumulatedAmount = signedSubRAV.subRav.accumulatedAmount + cost;

    return {
      version: 1,
      chainId: signedSubRAV.subRav.chainId,
      channelId,
      channelEpoch: signedSubRAV.subRav.channelEpoch,
      vmIdFragment,
      nonce: nextNonce,
      accumulatedAmount: newAccumulatedAmount
    };
  }

    /**
     * Check pending proposal priority as per rav-handling.md §4.1
     * Returns whether we should return early from preProcess
     */
    private async checkPendingProposalPriority(ctx: BillingContext): Promise<{ shouldReturnEarly: boolean }> {
      try {
        // Try to derive channel info from existing SignedSubRAV first
        let channelId: string | undefined;
        let vmIdFragment: string | undefined;

        if (ctx.meta.signedSubRav) {
          channelId = ctx.meta.signedSubRav.subRav.channelId;
          vmIdFragment = ctx.meta.signedSubRav.subRav.vmIdFragment;
        } else {
          // Attempt DIDAuth fallback to locate the sub-channel (§4.4)
          const didAuthResult = this.tryDIDAuthFallback(ctx);
          if (didAuthResult) {
            channelId = didAuthResult.channelId;
            vmIdFragment = didAuthResult.vmIdFragment;
          }
        }

        // If we can't determine channel info, continue with normal processing
        if (!channelId || !vmIdFragment) {
          this.log('No channel info available for pending proposal check');
          return { shouldReturnEarly: false };
        }

        // Check if there's a pending proposal for this (channelId, vmIdFragment)
        const latestPending = await this.pendingSubRAVStore.findLatestByChannel(channelId);
        if (!latestPending || latestPending.vmIdFragment !== vmIdFragment) {
          this.log('No pending proposal found for channel:', channelId, 'vmId:', vmIdFragment);
          return { shouldReturnEarly: false };
        }

        this.log('Found pending proposal:', { 
          channelId, 
          vmIdFragment, 
          nonce: latestPending.nonce.toString() 
        });

        // We have a pending proposal - must receive matching SignedSubRAV
        if (!ctx.meta.signedSubRav) {
          this.log('Pending proposal exists but no SignedSubRAV provided - returning 402');
          if (!ctx.state) ctx.state = {};
          ctx.state.error = { 
            code: 'PAYMENT_REQUIRED', 
            message: `Signature required for pending proposal (channel: ${channelId}, nonce: ${latestPending.nonce})` 
          } as any;
          return { shouldReturnEarly: true };
        }

        // Verify the SignedSubRAV matches the pending proposal
        if (ctx.meta.signedSubRav.subRav.channelId !== channelId ||
            ctx.meta.signedSubRav.subRav.vmIdFragment !== vmIdFragment ||
            ctx.meta.signedSubRav.subRav.nonce !== latestPending.nonce) {
          this.log('SignedSubRAV does not match pending proposal');
          if (!ctx.state) ctx.state = {};
          ctx.state.error = { 
            code: 'SUBRAV_CONFLICT', 
            message: `SignedSubRAV does not match pending proposal (expected nonce: ${latestPending.nonce}, received: ${ctx.meta.signedSubRav.subRav.nonce})` 
          } as any;
          return { shouldReturnEarly: true };
        }

        this.log('SignedSubRAV matches pending proposal - proceeding with verification');
        return { shouldReturnEarly: false };

      } catch (error) {
        this.log('Error during pending proposal check:', error);
        // Don't fail the request due to pending check errors - continue processing
        return { shouldReturnEarly: false };
      }
    }

    /**
     * Try to locate sub-channel using DIDAuth fallback (§4.4 of rav-handling.md)
     */
    private tryDIDAuthFallback(ctx: BillingContext): { channelId: string; vmIdFragment: string } | null {
      try {
        const didInfo = ctx.meta.didInfo;
        if (!didInfo || !didInfo.did || !didInfo.keyId) {
          this.log('No DIDAuth info available for fallback');
          return null;
        }

        // Extract vmIdFragment from keyId (format: "did:example:123#key-1")
        const keyIdParts = didInfo.keyId.split('#');
        if (keyIdParts.length < 2) {
          this.log('Invalid keyId format for DIDAuth fallback:', didInfo.keyId);
          return null;
        }
        const vmIdFragment = keyIdParts[1];

        // Derive channelId using the same logic as client
        const serviceDid = this.config.serviceId; // Assuming serviceId is the service DID
        const defaultAssetId = this.config.defaultAssetId || '0x3::gas_coin::RGas';
        
        // Use actual cryptographic derivation matching Move contract logic
        const channelId = deriveChannelId(didInfo.did, serviceDid, defaultAssetId);

        this.log('DIDAuth fallback derived:', { channelId, vmIdFragment });
        return { channelId, vmIdFragment };

      } catch (error) {
        this.log('Error in DIDAuth fallback:', error);
        return null;
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