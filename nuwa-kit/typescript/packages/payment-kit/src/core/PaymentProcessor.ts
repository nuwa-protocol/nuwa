import type { 
  SignedSubRAV,
  SubRAV 
} from './types';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import type { VerificationResult } from '../client/PaymentChannelPayeeClient';
import type { 
  BillingContext,
  CostCalculator
} from '../billing/types';
import type { PendingSubRAVStore } from './PendingSubRAVStore';
import { MemoryPendingSubRAVStore } from './PendingSubRAVStore';
import type { ClaimScheduler } from './claim-scheduler';
// Import PaymentUtils and BillingContextBuilder (remove if files don't exist yet)
// import { PaymentUtils } from './PaymentUtils';
// import { BillingContextBuilder } from './BillingContextBuilder';
  
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
    pendingSubRAVStore?: PendingSubRAVStore;
    
    /** Optional claim scheduler for automated claiming */
    claimScheduler?: ClaimScheduler;
    
    /** Debug logging */
    debug?: boolean;
  }
  
  /**
   * Protocol-agnostic request metadata
   */
  export interface RequestMetadata {
    /** Business operation identifier (e.g., "POST:/api/chat/completions") */
    operation: string;
    
    /** Optional business parameters */
    model?: string;
    assetId?: string;
    
    /** Payment channel information (extracted from signed SubRAV) */
    channelId?: string;
    vmIdFragment?: string;
    
    /** Protocol-specific additional metadata */
    [key: string]: any;
  }
  
  /**
 * Payment processing result from PaymentProcessor
 */
export interface ProcessorPaymentResult {
    /** Whether payment was processed successfully */
    success: boolean;
    
    /** Cost calculated for this request */
    cost: bigint;
    
    /** Asset ID used for calculation */
    assetId: string;
    
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
    private pendingSubRAVStore: PendingSubRAVStore;
    private stats: PaymentProcessingStats;
  
    constructor(config: PaymentProcessorConfig) {
      this.config = config;
      this.pendingSubRAVStore = config.pendingSubRAVStore || new MemoryPendingSubRAVStore();
      this.stats = {
        totalRequests: 0,
        successfulPayments: 0,
        failedPayments: 0,
        handshakes: 0,
        autoClaimsTriggered: 0
      };
    }
  
    /**
     * Process payment for a request using deferred payment model
     */
    async processPayment(
      requestMeta: RequestMetadata,
      signedSubRAV?: SignedSubRAV
    ): Promise<ProcessorPaymentResult> {
      this.stats.totalRequests++;
      
      this.log('Processing payment for operation:', requestMeta.operation);
  
      try {
        // Step 1: Check if signed SubRAV is provided
        if (!signedSubRAV) {
          this.stats.failedPayments++;
          return {
            success: false,
            cost: 0n,
            assetId: requestMeta.assetId || this.config.defaultAssetId || 'unknown',
            error: 'Signed SubRAV required for payment',
            errorCode: 'PAYMENT_REQUIRED'
          };
        }
  
              // Step 2: Check if this is a handshake request
      const isHandshake = signedSubRAV.subRav.nonce === 0n && signedSubRAV.subRav.accumulatedAmount === 0n;
      let autoClaimTriggered = false;
      let verificationResult: PaymentVerificationResult;
  
        if (isHandshake) {
          // Handshake verification
          verificationResult = await this.verifyHandshake(signedSubRAV);
          if (!verificationResult.isValid) {
            this.stats.failedPayments++;
            return {
              success: false,
              cost: 0n,
              assetId: signedSubRAV.subRav.channelId,
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
              assetId: signedSubRAV.subRav.channelId,
              error: verificationResult.error,
              errorCode: this.extractErrorCode(verificationResult.error || ''),
              isHandshake: false
            };
          }
  
          // Process the verified payment
          autoClaimTriggered = await this.processVerifiedPayment(signedSubRAV);
          this.stats.successfulPayments++;
        }
  
        // Step 3: Build billing context with channel info from signed SubRAV
        const enhancedMeta = {
          ...requestMeta,
          channelId: signedSubRAV.subRav.channelId,
          vmIdFragment: signedSubRAV.subRav.vmIdFragment
        };
        
              const billingContext = {
        serviceId: this.config.serviceId,
        operation: enhancedMeta.operation,
        assetId: enhancedMeta.assetId || this.config.defaultAssetId,
        meta: enhancedMeta
      };
  
        // Step 4: Calculate cost for current request
        const cost = await this.calculateCost(billingContext);
  
        if (cost === 0n) {
          // Free request, no payment needed
          return {
            success: true,
            cost: 0n,
            assetId: billingContext.assetId || this.config.defaultAssetId || 'unknown',
            autoClaimTriggered,
            isHandshake,
            payerKeyId: verificationResult.payerKeyId,
            signedSubRAV
          };
        }
  
        // Step 5: Generate unsigned SubRAV proposal for next request
        const unsignedSubRAV = await this.generateProposal(billingContext, cost);
        
        // Store the unsigned SubRAV for later verification
        await this.pendingSubRAVStore.save(unsignedSubRAV);
  
        return {
          success: true,
          cost,
          assetId: billingContext.assetId || this.config.defaultAssetId || 'unknown',
          unsignedSubRAV,
          signedSubRAV,
          autoClaimTriggered,
          isHandshake,
          payerKeyId: verificationResult.payerKeyId,
          serviceTxRef: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
        };
  
      } catch (error) {
        this.stats.failedPayments++;
        this.log('Payment processing error:', error);
        
        return {
          success: false,
          cost: 0n,
          assetId: requestMeta.assetId || this.config.defaultAssetId || 'unknown',
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
      const subRAVsMatch = (
        pendingSubRAV.version === signedSubRAV.subRav.version &&
        pendingSubRAV.chainId === signedSubRAV.subRav.chainId &&
        pendingSubRAV.channelId === signedSubRAV.subRav.channelId &&
        pendingSubRAV.channelEpoch === signedSubRAV.subRav.channelEpoch &&
        pendingSubRAV.vmIdFragment === signedSubRAV.subRav.vmIdFragment &&
        pendingSubRAV.accumulatedAmount === signedSubRAV.subRav.accumulatedAmount &&
        pendingSubRAV.nonce === signedSubRAV.subRav.nonce
      );
      if (!subRAVsMatch) {
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
      if (!context.assetId) {
        throw new Error('assetId is required for SubRAV generation');
      }
  
      const channelId = context.meta.channelId;
      const vmIdFragment = context.meta.vmIdFragment;
      
      if (!channelId || !vmIdFragment) {
        throw new Error('channelId and vmIdFragment are required for SubRAV generation');
      }
  
      // Get channel info to construct proper payer key ID
      const channelInfo = await this.config.payeeClient.getChannelInfo(channelId);
      const payerKeyId = `${channelInfo.payerDid}#${vmIdFragment}`;
  
      return await this.config.payeeClient.generateSubRAV({
        channelId,
        payerKeyId,
        amount,
        description: `${context.operation} - ${this.config.serviceId}`
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
     * Extract error code from error message
     */
    private extractErrorCode(error: string): string {
      if (error.includes('not found in pending list')) {
        return 'UNKNOWN_SUBRAV';
      } else if (error.includes('does not match')) {
        return 'TAMPERED_SUBRAV';
      } else if (error.includes('Invalid') && error.includes('signature')) {
        return 'INVALID_PAYMENT';
      } else if (error.includes('Channel')) {
        return 'CHANNEL_CLOSED';
      } else if (error.includes('Epoch')) {
        return 'EPOCH_MISMATCH';
      }
      return 'PAYMENT_ERROR';
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
     * Debug logging
     */
    private log(...args: any[]): void {
      if (this.config.debug) {
        console.log('[PaymentProcessor]', ...args);
      }
    }
  } 