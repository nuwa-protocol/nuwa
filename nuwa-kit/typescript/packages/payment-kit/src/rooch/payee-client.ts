/**
 * PayeeClient - High-level client for payment receivers
 * Integrates RAV storage, verification, and automated claiming
 */

import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import { DidAccountSigner, DebugLogger } from '@nuwa-ai/identity-kit';
import type { Signer } from '@roochnetwork/rooch-sdk';

import { RoochPaymentChannelContract, type RoochContractOptions } from './contract';
import { SubRAVSigner, SubRAVValidator } from '../core/subrav';
import { ClaimScheduler, type ClaimPolicy, type ScheduledClaimResult } from '../core/claim-scheduler';
import type { RAVStore } from '../core/storage';
import { MemoryRAVStore } from '../core/storage';
import type { HttpRequestPayload, HttpResponsePayload, SignedSubRAV } from '../core/types';
import { HttpHeaderCodec } from '../core/http-header';

export interface PayeeClientOptions {
  /** Rooch RPC URL */
  rpcUrl: string;
  
  /** Signer for claim transactions */
  signer: SignerInterface;
  
  /** DID resolver for RAV verification */
  didResolver: DIDResolver;
  
  /** RAV storage implementation */
  store?: RAVStore;
  
  /** Automated claiming policy */
  claimOptions?: ClaimPolicy;
  
  /** Contract options */
  contractOptions?: Partial<RoochContractOptions>;
  
  /** Enable debug logging */
  debug?: boolean;
}

export interface RAVVerificationResult {
  isValid: boolean;
  errors: string[];
  rav?: SignedSubRAV;
}

export interface PayeeStats {
  totalRAVsReceived: number;
  totalAmountReceived: bigint;
  uniqueChannels: number;
  uniquePayers: number;
  lastRAVTime?: number;
}

/**
 * PayeeClient - Complete solution for payment receivers
 * 
 * Features:
 * - RAV verification and storage
 * - Automated claiming with configurable policies
 * - HTTP Gateway integration
 * - Monitoring and statistics
 */
export class PayeeClient {
  private contract: RoochPaymentChannelContract;
  private store: RAVStore;
  private signer: SignerInterface;
  private didResolver: DIDResolver;
  private claimScheduler?: ClaimScheduler;
  private logger: DebugLogger;

  // Statistics tracking
  private stats: PayeeStats = {
    totalRAVsReceived: 0,
    totalAmountReceived: BigInt(0),
    uniqueChannels: 0,
    uniquePayers: 0,
  };

  constructor(options: PayeeClientOptions) {
    this.signer = options.signer;
    this.didResolver = options.didResolver;
    this.store = options.store || new MemoryRAVStore();
    this.logger = DebugLogger.get('PayeeClient');
    if (options.debug) {
      this.logger.setLevel('debug');
    }

    // Initialize contract
    this.contract = new RoochPaymentChannelContract({
      rpcUrl: options.rpcUrl,
      debug: options.debug,
      ...options.contractOptions,
    });

    // Initialize automated claiming if policy is provided
    if (options.claimOptions) {
      this.initializeClaimScheduler(options.claimOptions, options.debug);
    }

    this.logger.info('PayeeClient initialized', {
      hasClaimScheduler: !!this.claimScheduler,
      storeType: this.store.constructor.name,
    });
  }

  private async initializeClaimScheduler(policy: ClaimPolicy, debug?: boolean): Promise<void> {
    try {
      const roochSigner = await this.convertToRoochSigner();
      
      this.claimScheduler = new ClaimScheduler({
        store: this.store,
        contract: this.contract,
        signer: roochSigner,
        policy,
        debug,
      });

      this.logger.info('ClaimScheduler initialized', { policy });
    } catch (error) {
      this.logger.error('Failed to initialize ClaimScheduler:', error);
    }
  }

  /**
   * Start automated claiming (if configured)
   */
  startAutoClaiming(): void {
    if (!this.claimScheduler) {
      throw new Error('ClaimScheduler not configured. Provide claimOptions in constructor.');
    }
    
    this.claimScheduler.start();
  }

  /**
   * Stop automated claiming
   */
  stopAutoClaiming(): void {
    if (this.claimScheduler) {
      this.claimScheduler.stop();
    }
  }

  /**
   * Handle incoming RAV from HTTP request
   */
  async handleIncomingRAV(requestPayload: HttpRequestPayload): Promise<RAVVerificationResult> {
    const { signedSubRav } = requestPayload;
    
    this.logger.debug('Processing incoming RAV', {
      channelId: signedSubRav.subRav.channelId,
      vmIdFragment: signedSubRav.subRav.vmIdFragment,
      nonce: signedSubRav.subRav.nonce.toString(),
      amount: signedSubRav.subRav.accumulatedAmount.toString(),
    });

    // Verify RAV structure
    const structValidation = SubRAVValidator.validate(signedSubRav.subRav);
    if (!structValidation.valid) {
      return {
        isValid: false,
        errors: structValidation.errors,
      };
    }

    // Verify RAV sequence (monotonicity)
    const latestRAV = await this.store.getLatest(
      signedSubRav.subRav.channelId,
      signedSubRav.subRav.vmIdFragment
    );

    if (latestRAV) {
      const sequenceValidation = SubRAVValidator.validateSequence(latestRAV.subRav, signedSubRav.subRav);
      if (!sequenceValidation.valid) {
        return {
          isValid: false,
          errors: sequenceValidation.errors,
        };
      }
    }

    // Verify cryptographic signature
    const signatureValid = await SubRAVSigner.verify(signedSubRav, this.didResolver);
    if (!signatureValid) {
      return {
        isValid: false,
        errors: ['Invalid signature'],
      };
    }

    // Store the RAV
    try {
      await this.store.save(signedSubRav);
      
      // Update statistics
      this.updateStats(signedSubRav);
      
      this.logger.info('RAV accepted and stored', {
        channelId: signedSubRav.subRav.channelId,
        vmIdFragment: signedSubRav.subRav.vmIdFragment,
        nonce: signedSubRav.subRav.nonce.toString(),
      });

      return {
        isValid: true,
        errors: [],
        rav: signedSubRav,
      };
    } catch (error) {
      this.logger.error('Failed to store RAV:', error);
      return {
        isValid: false,
        errors: ['Storage error'],
      };
    }
  }

  /**
   * Handle HTTP Gateway request and generate response
   */
  async handleHttpRequest(requestHeader: string): Promise<string> {
    try {
      // Parse request
      const requestPayload = HttpHeaderCodec.parseRequestHeader(requestHeader);
      
      // Verify and store RAV
      const verification = await this.handleIncomingRAV(requestPayload);
      
      if (!verification.isValid) {
        // Return error response
        const errorResponse: HttpResponsePayload = {
          signedSubRav: requestPayload.signedSubRav, // Echo back the invalid RAV
          amountDebited: BigInt(0),
          errorCode: 400,
          message: `RAV verification failed: ${verification.errors.join(', ')}`,
          serviceTxRef: `error-${Date.now()}`,
        };
        
        return HttpHeaderCodec.buildResponseHeader(errorResponse);
      }

      // Generate successful response
      const response: HttpResponsePayload = {
        signedSubRav: verification.rav!,
        amountDebited: BigInt(0), // This would be calculated based on service cost
        serviceTxRef: `accepted-${Date.now()}`,
        errorCode: 0,
        message: 'RAV accepted',
      };

      return HttpHeaderCodec.buildResponseHeader(response);
    } catch (error) {
      this.logger.error('Error handling HTTP request:', error);
      throw error;
    }
  }

  /**
   * Manually trigger claims for a channel
   */
  async claimChannel(channelId: string, vmIdFragment?: string): Promise<ScheduledClaimResult[]> {
    if (!this.claimScheduler) {
      throw new Error('ClaimScheduler not configured');
    }
    
    return this.claimScheduler.triggerClaim(channelId, vmIdFragment);
  }

  /**
   * Get unclaimed RAVs for a channel
   */
  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    return this.store.getUnclaimedRAVs(channelId);
  }

  /**
   * Get all RAVs for a channel
   */
  async getAllRAVs(channelId: string): Promise<SignedSubRAV[]> {
    const ravs: SignedSubRAV[] = [];
    for await (const rav of this.store.list(channelId)) {
      ravs.push(rav);
    }
    return ravs;
  }

  /**
   * Get latest RAV for a sub-channel
   */
  async getLatestRAV(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    return this.store.getLatest(channelId, vmIdFragment);
  }

  /**
   * Get current statistics
   */
  getStats(): PayeeStats {
    return { ...this.stats };
  }

  /**
   * Get claim scheduler status (if available)
   */
  getClaimSchedulerStatus() {
    return this.claimScheduler?.getStatus();
  }

  /**
   * Get failed claim attempts for monitoring
   */
  getFailedClaims() {
    return this.claimScheduler?.getFailedAttempts() || [];
  }

  private updateStats(rav: SignedSubRAV): void {
    this.stats.totalRAVsReceived++;
    this.stats.totalAmountReceived += rav.subRav.accumulatedAmount;
    this.stats.lastRAVTime = Date.now();
    
    // Note: For accurate unique counts, you'd want to track these in the store
    // This is a simplified version
  }

  private async convertToRoochSigner(): Promise<DidAccountSigner> {
    return DidAccountSigner.create(this.signer);
  }
}

/**
 * Helper function to create PayeeClient with common configurations
 */
export async function createPayeeClient(options: PayeeClientOptions): Promise<PayeeClient> {
  const client = new PayeeClient(options);
  
  // Auto-start claiming if configured
  if (options.claimOptions) {
    client.startAutoClaiming();
  }
  
  return client;
} 