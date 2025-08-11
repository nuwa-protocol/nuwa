import type { SignedSubRAV, SubChannelState, SubRAV } from './types';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { VerificationResult } from '../client/PaymentChannelPayeeClient';
import type { BillingContext, PaymentError } from '../billing';
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

// Strongly typed non-null state after preProcess
type PaymentState = NonNullable<BillingContext['state']>;
type PreprocessedBillingContext = BillingContext & { state: PaymentState };

// Common error factories for consistency
const Errors = {
  rateNotAvailable: (assetId: string): PaymentError => ({
    code: 'RATE_NOT_AVAILABLE',
    message: `Missing exchange rate for asset ${assetId}`,
  }),
  maxAmountExceeded: (finalCost: bigint, max: bigint): PaymentError => ({
    code: 'MAX_AMOUNT_EXCEEDED',
    message: `Cost ${finalCost} exceeds maxAmount ${max}`,
    details: { finalCost: finalCost.toString(), max: max.toString() },
  }),
  internal: (msg: string): PaymentError => ({
    code: 'INTERNAL_SERVER_ERROR',
    message: msg,
  }),
} as const;

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
    try {
      registerBuiltinStrategies();
    } catch {}
    this.pendingSubRAVStore =
      config.pendingSubRAVStore || createPendingSubRAVRepo({ backend: 'memory' });
    // Default to the same RAV repository as the payee client if not provided
    this.ravRepository = config.ravRepository || config.payeeClient.getRAVRepository();
    this.stats = {
      totalRequests: 0,
      successfulPayments: 0,
      failedPayments: 0,
      autoClaimsTriggered: 0,
    };
  }

  /**
   * Step A: Pre-process request - complete all I/O operations and verification
   * Returns context with state populated for both pre-flight and post-flight
   */
  async preProcess(ctx: BillingContext): Promise<PreprocessedBillingContext> {
    this.stats.totalRequests++;

    this.log('Pre-processing payment for operation:', ctx.meta.operation);

    // Initialize state if not present
    if (!ctx.state) {
      ctx.state = {};
    }

    try {
      const pctx = ctx as PreprocessedBillingContext;
      const rule = pctx.meta.billingRule;
      // For free routes without a SignedSubRAV, skip verification entirely in preProcess
      if (rule && rule.paymentRequired === false && !pctx.meta.signedSubRav) {
        this.log('Free route without SignedSubRAV - skipping preProcess verification');
        return pctx;
      }
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
        return this.fail(
          pctx,
          {
            code: 'CHANNEL_CONTEXT_MISSING',
            message: 'channelId or vmIdFragment not derivable. Check DID authentication.',
          },
          { attachHeader: false }
        );
      }

      // Fetch channelInfo (must exist)
      const channelInfo = await this.config.payeeClient.getChannelInfo(channelId);
      if (!channelInfo) {
        return this.fail(
          pctx,
          { code: 'CHANNEL_NOT_FOUND', message: `CHANNEL_NOT_FOUND: ${channelId}` },
          { attachHeader: false }
        );
      }

      const subChannelState = await this.config.payeeClient.getSubChannelState(
        channelId,
        vmIdFragment
      );
      if (!subChannelState) {
        return this.fail(
          pctx,
          {
            code: 'SUBCHANNEL_NOT_AUTHORIZED',
            message: `SUBCHANNEL_NOT_AUTHORIZED: ${channelId}#${vmIdFragment}`,
          },
          { attachHeader: false }
        );
      }

      // Latest signed RAV from repository
      const latestSignedSubRav = await this.ravRepository.getLatest(channelId, vmIdFragment);

      // Fetch and cache chainId for proposal generation
      pctx.state.chainId = await this.config.payeeClient.getContract().getChainId();

      const payerDidDoc = await this.config.didResolver.resolveDID(channelInfo.payerDid);
      if (!payerDidDoc) {
        return this.fail(
          pctx,
          { code: 'DID_RESOLVE_FAILED', message: `DID_RESOLVE_FAILED: ${channelInfo.payerDid}` },
          { attachHeader: false }
        );
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

      pctx.state.channelInfo = channelInfo;
      pctx.state.subChannelState = subChannelState;
      pctx.state.latestSignedSubRav = latestSignedSubRav || undefined;

      // Handle early-return decisions
      if (ravResult.decision === 'REQUIRE_SIGNATURE_402' || ravResult.decision === 'CONFLICT') {
        this.log(
          '⚠️ Early return from preProcess due to decision:',
          ravResult.decision,
          ravResult.error
        );
        return this.fail(
          pctx,
          {
            code: (ravResult.error?.code as PaymentError['code']) ?? 'INTERNAL_SERVER_ERROR',
            message: ravResult.error?.message ?? 'Verification decision error',
          },
          { attachHeader: false }
        );
      }

      // Persist verification flags and apply side-effects on success
      pctx.state.signedSubRavVerified = ravResult.signedVerified;
      if (ravResult.pendingMatched && ravResult.signedVerified && pctx.meta.signedSubRav) {
        try {
          await this.pendingSubRAVStore.remove(
            pctx.meta.signedSubRav.subRav.channelId,
            pctx.meta.signedSubRav.subRav.vmIdFragment,
            pctx.meta.signedSubRav.subRav.nonce
          );
        } catch (e) {
          this.log('⚠️ Failed to remove matched pending:', e);
        }
        try {
          await this.ravRepository?.save(pctx.meta.signedSubRav);
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
          pctx.state.exchangeRate = exchangeRate;
        } catch (e) {
          pctx.state.error = { code: 'RATE_FETCH_FAILED', message: String(e) } as PaymentError;
        }
      }

      this.log('✅ Pre-processing completed');
      return pctx;
    } catch (error) {
      this.log('🚨 Pre-processing error:', error);
      if (!ctx.state) ctx.state = {};
      (ctx as PreprocessedBillingContext).state.signedSubRavVerified = false;
      return this.fail(ctx as PreprocessedBillingContext, Errors.internal(String(error)), {
        attachHeader: false,
      });
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
  // Overloads to allow external call sites to pass BillingContext while we enforce state internally
  settle(ctx: PreprocessedBillingContext, units?: number): PreprocessedBillingContext;
  settle(ctx: BillingContext, units?: number): BillingContext;
  settle(
    ctx: BillingContext | PreprocessedBillingContext,
    units?: number
  ): BillingContext | PreprocessedBillingContext {
    this.log('🔄 Settling billing with units:', units);

    const pctx = this.asPreprocessed(ctx as BillingContext);

    // Settling uses numeric units; no structured usage is attached to state

    try {
      const rule = pctx.meta.billingRule;

      // If a protocol-level error was set during preProcess or earlier, generate error header now
      if (pctx.state.error) {
        return this.fail(pctx, pctx.state.error);
      }

      // Unified synchronous calculation for both pre-flight and post-flight
      if (rule) {
        this.log('📊 Processing billing rule:', rule.id, 'paymentRequired:', rule.paymentRequired);
        const usageUnits =
          Number.isFinite(units) && (units as number) > 0 ? Math.floor(units as number) : 1;

        const strategy = getStrategy(rule);
        const usdCost = strategy.evaluate(pctx, usageUnits);

        // Convert to asset units if asset settlement is requested
        let finalCost = usdCost;
        const assetId = pctx.state?.channelInfo?.assetId;
        if (!assetId) {
          throw new Error('CHANNEL_INFO_MISSING: assetId not derivable. Check channelInfo.');
        }

        const rate = pctx.state.exchangeRate;
        if (!rate) {
          // Missing rate is a hard error as required
          return this.fail(pctx, Errors.rateNotAvailable(String(assetId)));
        }
        const conversion = convertUsdToAssetUsingPrice(usdCost, rate);
        finalCost = conversion.assetCost;

        pctx.state.cost = finalCost;

        // Check maxAmount limit
        if (pctx.meta.maxAmount && pctx.meta.maxAmount > 0n && finalCost > pctx.meta.maxAmount) {
          this.log(`Cost ${finalCost} exceeds maxAmount ${pctx.meta.maxAmount}`);
          return this.fail(pctx, Errors.maxAmountExceeded(finalCost, pctx.meta.maxAmount));
        }

        // Special handling for free routes (§4.3 of rav-handling.md)
        if (rule.paymentRequired === false) {
          // Free route: if client sent SignedSubRAV, verify but don't generate unsigned
          if (pctx.meta.signedSubRav && finalCost === 0n) {
            this.log(
              '📝 Free route with SignedSubRAV - verified but not generating unsigned SubRAV'
            );
            // Set minimal response state for free routes
            pctx.state.cost = finalCost;
            // Don't generate unsignedSubRav or headerValue for free routes
          } else if (pctx.meta.signedSubRav && finalCost > 0n) {
            // This shouldn't happen - free routes should have cost=0
            throw new Error('FREE_ROUTE_WITH_COST: free routes should have cost=0');
          } else {
            // Free route without SignedSubRAV - normal free processing
            this.log('📝 Free route without SignedSubRAV - no payment processing needed');
            pctx.state.cost = finalCost;
          }
        } else {
          // Paid route: always generate SubRAV and header (even if cost=0 per §4.2)
          // Require a baseline: SignedSubRAV, latestSignedSubRav, or subChannelState
          const hasSigned = !!pctx.meta.signedSubRav;
          const hasLatest = !!pctx.state && !!pctx.state.latestSignedSubRav;
          const hasSubState = !!pctx.state && !!(pctx.state as any).subChannelState;

          this.log('🔍 Baseline check:', {
            hasSigned,
            hasLatest,
            hasSubState,
            hasState: !!pctx.state,
            stateKeys: pctx.state ? Object.keys(pctx.state) : [],
          });

          if (!hasSigned && !hasLatest && !hasSubState) {
            return this.fail(pctx, {
              code: 'MISSING_CHANNEL_CONTEXT',
              message: 'No baseline SubRAV found to advance nonce',
            });
          }

          this.log('🔧 Generating SubRAV with finalCost:', finalCost);
          const { unsignedSubRAV, serviceTxRef, headerValue } = this.generateNextSubRAV({
            signedSubRAV: pctx.meta.signedSubRav,
            latestSignedSubRav: pctx.state?.latestSignedSubRav,
            subChannelState: pctx.state?.subChannelState!,
            chainId: pctx.state?.chainId!,
            clientTxRef: pctx.meta.clientTxRef,
            cost: finalCost,
          });
          this.log('🔧 Generated SubRAV:', {
            nonce: unsignedSubRAV.nonce,
            accumulatedAmount: unsignedSubRAV.accumulatedAmount,
            headerValue: !!headerValue,
          });
          pctx.state.unsignedSubRav = unsignedSubRAV;
          pctx.state.serviceTxRef = serviceTxRef;
          pctx.state.nonce = unsignedSubRAV.nonce;
          pctx.state.headerValue = headerValue;
        }

        this.log('✅ Billing settled successfully');
      }

      return pctx as typeof ctx;
    } catch (error) {
      this.log('🚨 Billing settlement error:', error);
      const p = this.asPreprocessed(ctx as BillingContext);
      p.state.cost = 0n;
      return this.fail(p, Errors.internal(String(error)));
    }
  }

  /**
   * Step D: Persist billing state to storage
   */
  async persist(ctx: PreprocessedBillingContext): Promise<void>;
  async persist(ctx: BillingContext): Promise<void>;
  async persist(ctx: BillingContext | PreprocessedBillingContext): Promise<void> {
    const pctx = this.asPreprocessed(ctx as BillingContext);
    if (!pctx.state?.unsignedSubRav) {
      this.log('⚠️ No unsignedSubRAV to persist');
      return;
    }

    try {
      this.log('💾 Persisting billing state');

      const newSubRAV = pctx.state.unsignedSubRav;

      // Clean up previous pending SubRAV (nonce - 1) to prevent accumulation
      if (newSubRAV.nonce > 1n) {
        const prevNonce = newSubRAV.nonce - 1n;
        try {
          await this.pendingSubRAVStore.remove(
            newSubRAV.channelId,
            newSubRAV.vmIdFragment,
            prevNonce
          );
          this.log('🗑️ Removed previous pending SubRAV:', {
            channelId: newSubRAV.channelId,
            nonce: prevNonce.toString(),
          });
        } catch (error) {
          this.log('⚠️ Failed to remove previous pending SubRAV:', error);
          // Don't fail the entire operation for cleanup errors
        }
      }

      // Store the new unsigned SubRAV for future verification
      await this.pendingSubRAVStore.save(newSubRAV);

      // Mark as persisted
      pctx.state.persisted = true;

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

    this.log(
      `Cleared ${clearedCount} expired pending SubRAV proposals (older than ${maxAgeMinutes} minutes)`
    );
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
  async findPendingProposal(
    channelId: string,
    vmIdFragment: string,
    nonce: bigint
  ): Promise<SubRAV | null> {
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
    signedSubRAV?: SignedSubRAV;
    latestSignedSubRav?: SignedSubRAV;
    subChannelState: SubChannelState;
    chainId: bigint;
    clientTxRef: string;
    cost: bigint;
  }): {
    unsignedSubRAV: SubRAV;
    serviceTxRef: string;
    headerValue: string;
  } {
    const serviceTxRef = `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const current = params.signedSubRAV?.subRav ??
      params.latestSignedSubRav?.subRav ?? {
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
      version: 1,
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
      accumulatedAmount: newAccumulatedAmount,
    };
  } 

  /**
   * Try to locate sub-channel using DIDAuth fallback (§4.4 of rav-handling.md)
   */
  private async tryDIDAuthFallback(
    ctx: BillingContext
  ): Promise<{ channelId: string; vmIdFragment: string } | null> {
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

      this.log('DIDAuth fallback derived:', {
        channelId,
        vmIdFragment,
        payerDid: didInfo.did,
        payeeDid,
      });
      return { channelId, vmIdFragment };
    } catch (error) {
      this.log('Error in DIDAuth fallback:', error);
      return null;
    }
  }

  // ---------- Internal helpers ----------

  private asPreprocessed(ctx: BillingContext): PreprocessedBillingContext {
    if (!ctx.state) {
      ctx.state = {};
    }
    return ctx as PreprocessedBillingContext;
  }

  private attachErrorHeader(ctx: PreprocessedBillingContext, error: PaymentError): void {
    try {
      if (!ctx.state.serviceTxRef) {
        ctx.state.serviceTxRef = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
      ctx.state.headerValue = HttpPaymentCodec.buildResponseHeader({
        error,
        clientTxRef: ctx.meta.clientTxRef,
        serviceTxRef: ctx.state.serviceTxRef,
        version: 1,
      } as any);
    } catch (e) {
      this.log('Failed to build error header:', e);
    }
  }

  private fail(
    ctx: PreprocessedBillingContext,
    error: PaymentError,
    options?: { attachHeader?: boolean }
  ): PreprocessedBillingContext {
    ctx.state.error = error;
    if (options?.attachHeader !== false) {
      this.attachErrorHeader(ctx, error);
    }
    return ctx;
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
