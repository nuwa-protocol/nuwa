import type { 
  SignedSubRAV,
  SubChannelState,
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
// Ensure built-in strategies are registered explicitly (no side-effect import)
import { registerBuiltinStrategies } from '../billing/strategies';
import type { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import type { RAVRepository } from '../storage/interfaces/RAVRepository';
import { createPendingSubRAVRepo } from '../storage/factories/createPendingSubRAVRepo';
import { HttpPaymentCodec } from '../middlewares/http/HttpPaymentCodec';
import type { ClaimScheduler } from './ClaimScheduler';
import { PaymentUtils } from './PaymentUtils';
import { deriveChannelId } from '../rooch/ChannelUtils';
  import { verify as verifyRav } from './RavVerifier';
import type { DIDResolver } from '@nuwa-ai/identity-kit';

  
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

    /** DID resolver used for signature verification (avoid accessing payeeClient internals) */
    didResolver: DIDResolver;

    /** Store for pending unsigned SubRAV proposals */
    pendingSubRAVStore: PendingSubRAVRepository;
    /** Repository for persisted SignedSubRAVs to retrieve latest baseline */
    ravRepository: RAVRepository;
    
    /** Default asset ID if not provided in request context */
    defaultAssetId?: string;
    
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
    private ravRepository: RAVRepository;
    private stats: PaymentProcessingStats;
  
    constructor(config: PaymentProcessorConfig) {
      this.config = config;
    // Register built-in billing strategies explicitly
    try { registerBuiltinStrategies(); } catch {}
      this.pendingSubRAVStore = config.pendingSubRAVStore || createPendingSubRAVRepo({ backend: 'memory' });
      // Default to the same RAV repository as the payee client if not provided
      this.ravRepository = config.ravRepository || config.payeeClient.getRAVRepository();
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
      // Step 0: Prefetch channel context (channelInfo, baseline, chainId)
      // Determine channelId and vmIdFragment (must exist)
      let channelId: string | undefined;
      let vmIdFragment: string | undefined;

      if (ctx.meta.signedSubRav) {
        channelId = ctx.meta.signedSubRav.subRav.channelId;
        vmIdFragment = ctx.meta.signedSubRav.subRav.vmIdFragment;
      } else {
        const didAuth = await this.tryDIDAuthFallback(ctx);
        if (didAuth) {
          channelId = didAuth.channelId;
          vmIdFragment = didAuth.vmIdFragment;
        }
      }

      if (!channelId || !vmIdFragment) {
        throw new Error('CHANNEL_CONTEXT_MISSING: channelId or vmIdFragment not derivable. Check DID authentication.');
      }

      // Fetch channelInfo (must exist)
      const channelInfo = await this.config.payeeClient.getChannelInfo(channelId);
      if (!channelInfo) {
        ctx.state.error = { code: 'CHANNEL_NOT_FOUND', message: `CHANNEL_NOT_FOUND: ${channelId}` } as any;
        return ctx;
      }
      

      const subChannelState = await this.config.payeeClient.getSubChannelState(channelId, vmIdFragment);
      if (!subChannelState) {
        ctx.state.error = { code: 'SUBCHANNEL_NOT_AUTHORIZED', message: `SUBCHANNEL_NOT_AUTHORIZED: ${channelId}#${vmIdFragment}` } as any;
        return ctx;
      }
      

      // Latest signed RAV from repository
      const latestSignedSubRav = await this.ravRepository.getLatest(channelId, vmIdFragment);
      

      // Fetch and cache chainId for proposal generation
      ctx.state.chainId = await this.config.payeeClient.getContract().getChainId();

      const payerDidDoc = await this.config.didResolver.resolveDID(channelInfo.payerDid);
      if (!payerDidDoc) {
        ctx.state.error = { code: 'DID_RESOLVE_FAILED', message: `DID_RESOLVE_FAILED: ${channelInfo.payerDid}` } as any;
        return ctx;
      }

      // Single-entry verification using prefetched context
      const ravResult = await verifyRav({
        channelInfo,
        subChannelState,
        billingRule: ctx.meta.billingRule!,
        payerDidDoc,
        signedSubRav: ctx.meta.signedSubRav,
        latestSignedSubRav: latestSignedSubRav || undefined,
        debug: this.config.debug,
      });

      ctx.state.channelInfo = channelInfo;
      ctx.state.subChannelState = subChannelState;
      ctx.state.latestSignedSubRav = latestSignedSubRav || undefined;

      // Handle early-return decisions
      if (ravResult.decision === 'REQUIRE_SIGNATURE_402' || ravResult.decision === 'CONFLICT') {
        if (!ctx.state) ctx.state = {};
        ctx.state.error = ravResult.error as any;
        this.log('⚠️ Early return from preProcess due to decision:', ravResult.decision, ravResult.error);
        return ctx;
      }

      // Persist verification flags and apply side-effects on success
      ctx.state.signedSubRavVerified = ravResult.signedVerified;
      if (ravResult.pendingMatched && ravResult.signedVerified && ctx.meta.signedSubRav) {
        try {
          await this.pendingSubRAVStore.remove(
            ctx.meta.signedSubRav.subRav.channelId,
            ctx.meta.signedSubRav.subRav.vmIdFragment,
            ctx.meta.signedSubRav.subRav.nonce,
          );
        } catch (e) {
          this.log('⚠️ Failed to remove matched pending:', e);
        }
        try {
          await this.ravRepository?.save(ctx.meta.signedSubRav);
        } catch (e) {
          this.log('⚠️ Failed to persist verified SignedSubRAV:', e);
        }
      }

      const assetId = channelInfo.assetId;
      // Step 3: Prefetch exchange rate only (no cost calculation here)
      {
        try {
          const price = await this.config.rateProvider.getPricePicoUSD(assetId);
          const timestamp = this.config.rateProvider.getLastUpdated(assetId) ?? Date.now();
          const exchangeRate: RateResult = {
            price,
            timestamp,
            provider: 'rate-provider',
            assetId,
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

  getPendingSubRAVRepository(): PendingSubRAVRepository {
    return this.pendingSubRAVStore;
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

        const strategy = getStrategy(rule);
        const usdCost = strategy.evaluate(ctx, usageUnits);

        // Convert to asset units if asset settlement is requested
        let finalCost = usdCost;
        const assetId = ctx.state?.channelInfo?.assetId;
        if (!assetId) {
          throw new Error('CHANNEL_INFO_MISSING: assetId not derivable. Check channelInfo.');
        }
      
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
            throw new Error('FREE_ROUTE_WITH_COST: free routes should have cost=0');
          } else {
            // Free route without SignedSubRAV - normal free processing
            this.log('📝 Free route without SignedSubRAV - no payment processing needed');
            ctx.state.cost = finalCost;
          }
        } else {
          // Paid route: always generate SubRAV and header (even if cost=0 per §4.2)
          // Require a baseline: SignedSubRAV, latestSignedSubRav, or subChannelState
          const hasSigned = !!ctx.meta.signedSubRav;
          const hasLatest = !!(ctx.state && ctx.state.latestSignedSubRav);
          const hasSubState = !!(ctx.state && (ctx.state as any).subChannelState);
          
          this.log('🔍 Baseline check:', {
            hasSigned,
            hasLatest,
            hasSubState,
            hasState: !!ctx.state,
            stateKeys: ctx.state ? Object.keys(ctx.state) : []
          });
          
          if (!hasSigned && !hasLatest && !hasSubState) {
            const err = { code: 'MISSING_CHANNEL_CONTEXT', message: 'No baseline SubRAV found to advance nonce' } as any;
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

          this.log('🔧 Generating SubRAV with finalCost:', finalCost);
          const { unsignedSubRAV, serviceTxRef, headerValue } = this.generateNextSubRAV({
            signedSubRAV: ctx.meta.signedSubRav,
            latestSignedSubRav: ctx.state?.latestSignedSubRav,
            subChannelState: ctx.state?.subChannelState!,
            chainId: ctx.state?.chainId!,
            clientTxRef: ctx.meta.clientTxRef,
            cost: finalCost,
          });
          this.log('🔧 Generated SubRAV:', { nonce: unsignedSubRAV.nonce, accumulatedAmount: unsignedSubRAV.accumulatedAmount, headerValue: !!headerValue });
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
      
      const newSubRAV = ctx.state.unsignedSubRav;
      
      // Clean up previous pending SubRAV (nonce - 1) to prevent accumulation
      if (newSubRAV.nonce > 1n) {
        const prevNonce = newSubRAV.nonce - 1n;
        try {
          await this.pendingSubRAVStore.remove(newSubRAV.channelId, newSubRAV.vmIdFragment, prevNonce);
          this.log('🗑️ Removed previous pending SubRAV:', {
            channelId: newSubRAV.channelId,
            nonce: prevNonce.toString()
          });
        } catch (error) {
          this.log('⚠️ Failed to remove previous pending SubRAV:', error);
          // Don't fail the entire operation for cleanup errors
        }
      }
      
      // Store the new unsigned SubRAV for future verification
      await this.pendingSubRAVStore.save(newSubRAV);
      
      // Mark as persisted
      ctx.state.persisted = true;
      
      this.log('✅ Billing state persisted successfully');
    } catch (error) {
      this.log('🚨 Persistence error:', error);
      throw error;
    }
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
    async findPendingProposal(channelId: string, vmIdFragment: string, nonce: bigint): Promise<SubRAV | null> {
      return await this.pendingSubRAVStore.find(channelId, vmIdFragment, nonce);
    }

    /**
     * Find the latest pending SubRAV proposal for a channel (for recovery scenarios)
     */
    async findLatestPendingProposal(channelId: string, vmIdFragment: string): Promise<SubRAV | null> {
      return await this.pendingSubRAVStore.findLatestBySubChannel(channelId, vmIdFragment);
    }

    /**
     * Generate SubRAV and header synchronously for post-flight billing
     */
    private generateNextSubRAV(params: {
      signedSubRAV?: SignedSubRAV,
      latestSignedSubRav?: SignedSubRAV,
      subChannelState: SubChannelState,
      chainId: bigint,
      clientTxRef: string,
      cost: bigint}
    ): {
      unsignedSubRAV: SubRAV;
      serviceTxRef: string;
      headerValue: string;
    } {
      const serviceTxRef = `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const current = params.signedSubRAV?.subRav ?? params.latestSignedSubRav?.subRav ?? {
        channelId: params.subChannelState.channelId,
        vmIdFragment: params.subChannelState.vmIdFragment,
        nonce: params.subChannelState.lastConfirmedNonce,
        accumulatedAmount: params.subChannelState.lastClaimedAmount,
        chainId: params.chainId,
        channelEpoch: params.subChannelState.epoch,
        version: 1,
      };

      const next = this.buildNextUnsigned(current, params.cost);
      
      
      // Generate header using HttpPaymentCodec (new payload shape)
      const responsePayload = {
        subRav: next,
        cost: params.cost,
        clientTxRef: params.clientTxRef,
        serviceTxRef,
        version: 1
      } as any;

      const headerValue = HttpPaymentCodec.buildResponseHeader(responsePayload);

      return { unsignedSubRAV: next, serviceTxRef, headerValue };
    }
 

  /**
   * Build next unsigned SubRAV following the prior signed SubRAV, reused by async/sync paths.
   */
  private buildNextUnsigned(current: SubRAV, cost: bigint): SubRAV {
    const channelId = current.channelId;
    const vmIdFragment = current.vmIdFragment;
    const currentNonce = current.nonce;
    const nextNonce = currentNonce + 1n;
    const newAccumulatedAmount = current.accumulatedAmount + cost;

    return {
      version: 1,
      chainId: current.chainId,
      channelId,
      channelEpoch: current.channelEpoch,
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
          const didAuthResult = await this.tryDIDAuthFallback(ctx);
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
        const latestPending = await this.pendingSubRAVStore.findLatestBySubChannel(channelId, vmIdFragment);
        if (!latestPending) {
          this.log('No pending proposal found for channel:', channelId, 'vmId:', vmIdFragment);
          return { shouldReturnEarly: false };
        }

        this.log('Found pending proposal:', { 
          channelId, 
          vmIdFragment, 
          nonce: latestPending.nonce.toString() 
        });

        // We have a pending proposal - must receive matching SignedSubRAV (unless free route)
        if (!ctx.meta.signedSubRav) {
          // Check if this is a free route (recovery, admin endpoints, etc.)
          const rule = ctx.meta.billingRule;
          if (rule && rule.paymentRequired === false) {
            this.log('Pending proposal exists but this is a free route - allowing access');
            return { shouldReturnEarly: false };
          }
          
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
    private async tryDIDAuthFallback(ctx: BillingContext): Promise<{ channelId: string; vmIdFragment: string } | null> {
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

        // Get payee DID from the payee client
        const payeeDid = await this.config.payeeClient.getPayeeDid();
        const defaultAssetId = this.config.defaultAssetId || '0x3::gas_coin::RGas';
        
        // Use actual cryptographic derivation matching Move contract logic
        const channelId = deriveChannelId(didInfo.did, payeeDid, defaultAssetId);

        this.log('DIDAuth fallback derived:', { channelId, vmIdFragment, payerDid: didInfo.did, payeeDid });
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