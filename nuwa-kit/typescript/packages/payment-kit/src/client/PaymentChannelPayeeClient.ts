/**
 * Chain-agnostic Payment Channel Payee Client
 * 
 * This client provides a unified interface for payment channel operations
 * from the Payee perspective, using the IPaymentChannelContract abstraction.
 */

import type {
  AssetInfo,
  SubChannelState,
  ChannelInfo,
  SignedSubRAV,
  SubRAV,
} from '../core/types';
import type { IPaymentChannelContract, ClaimResult } from '../contracts/IPaymentChannelContract';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import { ChannelStateStorage, MemoryChannelStateStorage, type StorageOptions } from '../core/ChannelStateStorage';
import { SubRAVManager, SubRAVUtils } from '../core/subrav';

export interface PaymentChannelPayeeClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  didResolver: DIDResolver; // Required for signature verification
  storageOptions?: StorageOptions;
}

export interface VerificationResult {
  isValid: boolean;
  error?: string;
  details?: {
    signatureValid: boolean;
    channelExists: boolean;
    epochMatches: boolean;
    nonceProgression: boolean;
    amountValid: boolean;
  };
}

export interface ClaimOptions {
  signedSubRAV: SignedSubRAV;
  validateBeforeClaim?: boolean;
}

export interface GenerateSubRAVParams {
  channelId: string;
  payerKeyId: string; // Full keyId like "did:example:payer#key1"
  amount: bigint;
  description?: string; // Optional description for the charge
}

export interface ListChannelsOptions {
  status?: 'active' | 'closed' | 'closing';
  offset?: number;
  limit?: number;
}

/**
 * Chain-agnostic Payment Channel Payee Client
 * 
 * Provides high-level APIs for payment channel operations from the Payee perspective:
 * - Verifying received SubRAVs
 * - Claiming payments from channels
 * - Managing channel lifecycle from payee side
 * - Monitoring channel states and balances
 * 
 * This client is designed to be used by service providers who need to:
 * 1. Validate incoming payment receipts (SubRAVs)
 * 2. Submit claims to retrieve payments
 * 3. Monitor and manage payment channels
 */
export class PaymentChannelPayeeClient {
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private didResolver: DIDResolver;
  private stateStorage: ChannelStateStorage;
  private ravManager: SubRAVManager;
  private chainIdCache?: bigint;

  constructor(options: PaymentChannelPayeeClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.didResolver = options.didResolver; // Now required
    
    // Initialize storage
    if (options.storageOptions?.customStorage) {
      this.stateStorage = options.storageOptions.customStorage;
    } else {
      this.stateStorage = new MemoryChannelStateStorage();
    }
    
    this.ravManager = new SubRAVManager();
  }

  // -------- SubRAV Generation (for API services) --------

  /**
   * Generate an unsigned SubRAV for a consumption charge
   * This is used by API services (like LLM Gateway) to create payment requests
   * after calculating the actual consumption cost
   */
  async generateSubRAV(params: GenerateSubRAVParams): Promise<SubRAV> {
    const { channelId, payerKeyId, amount, description } = params;

    // Get channel info to validate (using cache to ensure local storage is updated)
    const channelInfo = await this.getChannelInfoCached(channelId);
    
    // Get current sub-channel state or initialize if first time
    let subChannelState;
    try {
      subChannelState = await this.stateStorage.getSubChannelState(channelId, payerKeyId);
    } catch (error) {
      // First SubRAV for this sub-channel, initialize state
      subChannelState = {
        channelId,
        epoch: channelInfo.epoch,
        accumulatedAmount: BigInt(0),
        nonce: BigInt(0),
        lastUpdated: Date.now(),
      };
      
      // Store initial state
      await this.stateStorage.updateSubChannelState(channelId, payerKeyId, subChannelState);
    }

    // Validate that epoch matches
    if (subChannelState.epoch !== channelInfo.epoch) {
      throw new Error(`Epoch mismatch: local ${subChannelState.epoch}, chain ${channelInfo.epoch}`);
    }

    // Calculate new values
    const newNonce = subChannelState.nonce + BigInt(1);
    const newAccumulatedAmount = subChannelState.accumulatedAmount + amount;

    // Extract vmIdFragment from full keyId
    const vmIdFragment = this.extractVmIdFragment(payerKeyId);

    const chainId = await this.getChainId();

    const subRAV: SubRAV = SubRAVUtils.create({
      chainId: chainId,
      channelId: channelId,
      channelEpoch: channelInfo.epoch,
      vmIdFragment: vmIdFragment,
      accumulatedAmount: newAccumulatedAmount,
      nonce: newNonce,
    });

    // Note: We don't update local state here - it will be updated when we receive 
    // the signed SubRAV back and verify it successfully
    
    return subRAV;
  }

  /**
   * Process a signed SubRAV received from a payer
   * This confirms the previously generated SubRAV and updates final state
   */
  async processSignedSubRAV(signedSubRAV: SignedSubRAV): Promise<void> {
    // Verify the signed SubRAV
    const verification = await this.verifySubRAV(signedSubRAV);
    if (!verification.isValid) {
      throw new Error(`Invalid signed SubRAV: ${verification.error}`);
    }

    // Update local state now that we have a verified signed SubRAV
    const channelInfo = await this.getChannelInfoCached(signedSubRAV.subRav.channelId);
    const keyId = this.reconstructKeyId(channelInfo.payerDid, signedSubRAV.subRav.vmIdFragment);
    
    await this.stateStorage.updateSubChannelState(signedSubRAV.subRav.channelId, keyId, {
      channelId: signedSubRAV.subRav.channelId,
      epoch: signedSubRAV.subRav.channelEpoch,
      accumulatedAmount: signedSubRAV.subRav.accumulatedAmount,
      nonce: signedSubRAV.subRav.nonce,
      lastUpdated: Date.now(),
    });

    console.log(`Successfully processed signed SubRAV for channel ${signedSubRAV.subRav.channelId}, nonce ${signedSubRAV.subRav.nonce}`);
  }

  // -------- SubRAV Verification --------

  /**
   * Verify a SubRAV received from a payer
   * This performs comprehensive validation including signature verification
   */
  async verifySubRAV(signedSubRAV: SignedSubRAV): Promise<VerificationResult> {
    const result: VerificationResult = {
      isValid: false,
      details: {
        signatureValid: false,
        channelExists: false,
        epochMatches: false,
        nonceProgression: false,
        amountValid: false,
      },
    };

    try {
      // 1. Check if channel exists and get current state first
      let channelInfo: ChannelInfo;
      try {
        channelInfo = await this.getChannelInfoCached(signedSubRAV.subRav.channelId);
        result.details!.channelExists = true;
      } catch (error) {
        result.error = `Channel ${signedSubRAV.subRav.channelId} not found`;
        return result;
      }

      // 2. Verify signature using DID from channel info
      try {
        // Use payerDid from channel info to verify signature
        const signatureValid = await this.ravManager.verifyWithResolver(
          signedSubRAV, 
          channelInfo.payerDid, 
          this.didResolver
        );
        result.details!.signatureValid = signatureValid;
        
        if (!signatureValid) {
          result.error = 'Invalid SubRAV signature';
          return result;
        }
      } catch (error) {
        result.error = `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return result;
      }

      // 3. Verify channel epoch matches
      const epochMatches = channelInfo.epoch === signedSubRAV.subRav.channelEpoch;
      result.details!.epochMatches = epochMatches;
      
      if (!epochMatches) {
        result.error = `Epoch mismatch: expected ${channelInfo.epoch}, got ${signedSubRAV.subRav.channelEpoch}`;
        return result;
      }

      // 4. Verify nonce progression (if we have previous state)
      const keyId = this.reconstructKeyId(channelInfo.payerDid, signedSubRAV.subRav.vmIdFragment);
      try {
        const prevState = await this.stateStorage.getSubChannelState(signedSubRAV.subRav.channelId, keyId);
        
        // Allow same nonce if it's the exact same SubRAV (same amount and other fields)
        const isSameSubRAV = signedSubRAV.subRav.nonce === prevState.nonce && 
                            signedSubRAV.subRav.accumulatedAmount === prevState.accumulatedAmount &&
                            signedSubRAV.subRav.channelEpoch === prevState.epoch;
        
        const nonceProgression = signedSubRAV.subRav.nonce > prevState.nonce || isSameSubRAV;
        result.details!.nonceProgression = nonceProgression;
        
        if (!nonceProgression) {
          result.error = `Invalid nonce progression: expected > ${prevState.nonce}, got ${signedSubRAV.subRav.nonce}`;
          return result;
        }

        // Verify amount is not decreasing (unless it's the same SubRAV)
        const amountValid = signedSubRAV.subRav.accumulatedAmount >= prevState.accumulatedAmount;
        result.details!.amountValid = amountValid;
        
        if (!amountValid) {
          result.error = `Amount cannot decrease: expected >= ${prevState.accumulatedAmount}, got ${signedSubRAV.subRav.accumulatedAmount}`;
          return result;
        }
      } catch (error) {
        // No previous state found - this is the first SubRAV for this sub-channel
        result.details!.nonceProgression = signedSubRAV.subRav.nonce === BigInt(1);
        result.details!.amountValid = signedSubRAV.subRav.accumulatedAmount > BigInt(0);
        
        if (!result.details!.nonceProgression) {
          result.error = `First nonce must be 1, got ${signedSubRAV.subRav.nonce}`;
          return result;
        }
      }

      // All validations passed
      result.isValid = true;
      return result;

    } catch (error) {
      result.error = `Verification failed: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
  }

  /**
   * Store a verified SubRAV for later claiming
   * This updates the local state tracking for the sub-channel
   */
  async storeVerifiedSubRAV(signedSubRAV: SignedSubRAV): Promise<void> {
    const verification = await this.verifySubRAV(signedSubRAV);
    if (!verification.isValid) {
      throw new Error(`Cannot store invalid SubRAV: ${verification.error}`);
    }

    // Get channel info to reconstruct keyId
    const channelInfo = await this.getChannelInfoCached(signedSubRAV.subRav.channelId);
    const keyId = this.reconstructKeyId(channelInfo.payerDid, signedSubRAV.subRav.vmIdFragment);

    // Update sub-channel state
    await this.stateStorage.updateSubChannelState(signedSubRAV.subRav.channelId, keyId, {
      channelId: signedSubRAV.subRav.channelId,
      epoch: signedSubRAV.subRav.channelEpoch,
      accumulatedAmount: signedSubRAV.subRav.accumulatedAmount,
      nonce: signedSubRAV.subRav.nonce,
      lastUpdated: Date.now(),
    });
  }

  // -------- Claims Management --------

  /**
   * Claim payment from a channel using a signed SubRAV
   */
  async claimFromChannel(options: ClaimOptions): Promise<ClaimResult> {
    const { signedSubRAV, validateBeforeClaim = true } = options;

    // Optional pre-claim validation
    if (validateBeforeClaim) {
      const verification = await this.verifySubRAV(signedSubRAV);
      if (!verification.isValid) {
        throw new Error(`Cannot claim with invalid SubRAV: ${verification.error}`);
      }
    }

    // Submit claim to blockchain
    const claimParams = {
      signedSubRAV,
      signer: this.signer,
    };

    const result = await this.contract.claimFromChannel(claimParams);

    // Update local state after successful claim
    await this.storeVerifiedSubRAV(signedSubRAV);

    return result;
  }

  /**
   * Batch claim multiple SubRAVs
   * Falls back to individual claims
   */
  async batchClaimFromChannels(signedSubRAVs: SignedSubRAV[]): Promise<ClaimResult[]> {
    const results: ClaimResult[] = [];
    
    for (const signedSubRAV of signedSubRAVs) {
      try {
        const result = await this.claimFromChannel({ 
          signedSubRAV, 
          validateBeforeClaim: true 
        });
        results.push(result);
      } catch (error) {
        // Continue with other claims even if one fails
        console.warn(`Failed to claim SubRAV for channel ${signedSubRAV.subRav.channelId}:`, error);
        throw error;
      }
    }

    return results;
  }

  // -------- Channel Management --------

  /**
   * Close a payment channel (from payee side)
   */
  async closeChannel(channelId: string, cooperative: boolean = true): Promise<{ txHash: string }> {
    const result = await this.contract.closeChannel({
      channelId,
      cooperative,
      signer: this.signer,
    });

    // Update local cache to mark channel as closed
    const metadata = await this.stateStorage.getChannelMetadata(channelId);
    if (metadata) {
      metadata.status = 'closed';
      await this.stateStorage.setChannelMetadata(channelId, metadata);
    }

    return { txHash: result.txHash };
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId: string): Promise<ChannelInfo> {
    return this.contract.getChannelStatus({ channelId });
  }

  /**
   * Get channel info with caching using ChannelStateStorage
   * This checks local storage first, then falls back to chain if not found or stale
   */
  private async getChannelInfoCached(channelId: string, forceRefresh: boolean = false): Promise<ChannelInfo> {
    // Try to get from local storage first (unless forced refresh)
    if (!forceRefresh) {
      const cachedMetadata = await this.stateStorage.getChannelMetadata(channelId);
      if (cachedMetadata) {
        // Convert ChannelMetadata to ChannelInfo
        return cachedMetadata;
      }
    }
    
    // Fetch from chain and cache
    try {
      const channelInfo = await this.contract.getChannelStatus({ channelId });
      
      // Store in cache as ChannelMetadata
      await this.stateStorage.setChannelMetadata(channelId, channelInfo);
      
      return channelInfo;
    } catch (error) {
      // If chain call fails and we have stale cache, use it
      if (!forceRefresh) {
        const staleMetadata = await this.stateStorage.getChannelMetadata(channelId);
        if (staleMetadata) {
          console.warn(`Chain call failed for channel ${channelId}, using stale cache`);
          return staleMetadata;
        }
      }
      throw error;
    }
  }

  /**
   * List active channels where this payee is involved
   */
  async listActiveChannels(options: ListChannelsOptions = {}): Promise<ChannelInfo[]> {
    const payeeDid = await this.signer.getDid();
    
    // Get channels from storage first
    const storageResult = await this.stateStorage.listChannelMetadata(
      { 
        payeeDid, 
        status: options.status || 'active' 
      },
      {
        offset: options.offset || 0,
        limit: options.limit || 50,
      }
    );

    // Get current status for each channel (using cache for efficiency)
    const channelInfos: ChannelInfo[] = [];
    for (const metadata of storageResult.items) {
      try {
        const info = await this.getChannelInfoCached(metadata.channelId);
        channelInfos.push(info);
      } catch (error) {
        console.warn(`Failed to get status for channel ${metadata.channelId}:`, error);
      }
    }

    return channelInfos;
  }

  /**
   * Sync channel state from blockchain to local storage
   * This force-refreshes the cached channel metadata
   */
  async syncChannelState(channelId: string): Promise<void> {
    try {
      // Force refresh from chain and update cache
      await this.getChannelInfoCached(channelId, true);
      console.log(`Synced channel ${channelId} state from blockchain`);
    } catch (error) {
      console.error(`Failed to sync channel ${channelId}:`, error);
      throw error;
    }
  }

  // -------- Asset Information --------

  /**
   * Get asset information
   */
  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    return this.contract.getAssetInfo(assetId);
  }

  /**
   * Get asset price in pUSD
   */
  async getAssetPrice(assetId: string): Promise<bigint> {
    return this.contract.getAssetPrice(assetId);
  }

  // -------- Private Helpers --------

  /**
   * Extract vmIdFragment from full keyId (e.g., "did:example:payer#key1" → "key1")
   */
  private extractVmIdFragment(keyId: string): string {
    const parts = keyId.split('#');
    if (parts.length !== 2) {
      throw new Error(`Invalid keyId format: ${keyId}. Expected format: "did:example:payer#fragment"`);
    }
    return parts[1];
  }

  /**
   * Reconstruct keyId from payerDid and vmIdFragment
   */
  private reconstructKeyId(payerDid: string, vmIdFragment: string): string {
    return `${payerDid}#${vmIdFragment}`;
  }

  /**
   * Get cached chain ID or fetch from contract
   */
  private async getChainId(): Promise<bigint> {
    if (this.chainIdCache === undefined) {
      this.chainIdCache = await this.contract.getChainId();
    }
    return this.chainIdCache;
  }
} 