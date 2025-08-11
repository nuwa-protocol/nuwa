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
import type { ChannelRepository, RAVRepository, PendingSubRAVRepository } from '../storage';
import { SubRAVUtils } from '../core/SubRav';
import { PaymentUtils } from '../core/PaymentUtils';
import { PaymentHubClient } from './PaymentHubClient';

/**
 * Storage options for PaymentChannelPayeeClient
 */
export interface PayeeStorageOptions {
  channelRepo: ChannelRepository;
  ravRepo: RAVRepository;
  pendingSubRAVRepo: PendingSubRAVRepository;
}

export interface PaymentChannelPayeeClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  didResolver: DIDResolver; // Required for signature verification
  storageOptions: PayeeStorageOptions;
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
  private channelRepo: ChannelRepository;
  private ravRepo: RAVRepository;
  private pendingSubRAVRepo: PendingSubRAVRepository;
  private chainIdCache?: bigint;
  private defaultAssetId: string;

  constructor(options: PaymentChannelPayeeClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.didResolver = options.didResolver;
    this.defaultAssetId = "0x3::gas_coin::RGas";
    
    // Initialize repositories
    this.channelRepo = options.storageOptions.channelRepo;
    this.ravRepo = options.storageOptions.ravRepo;
    this.pendingSubRAVRepo = options.storageOptions.pendingSubRAVRepo;
  }

  // -------- Public accessors for internal components --------

  /**
   * Get the RAV repository used by this client
   * This is needed for ClaimScheduler to access the same RAV data
   */
  getRAVRepository(): RAVRepository {
    return this.ravRepo;
  }

  getDidResolver(): DIDResolver {
    return this.didResolver;
  }

  /**
   * Get the contract instance used by this client
   * This is needed for ClaimScheduler to perform claims
   */
  getContract(): IPaymentChannelContract {
    return this.contract;
  }

  /**
   * Get the channel repository used by this client
   */
  getChannelRepository(): ChannelRepository {
    return this.channelRepo;
  }

  /**
   * Get sub-channel state by (channelId, vmIdFragment)
   * If not found locally, try deriving from on-chain and sync into repository.
   */
  async getSubChannelState(channelId: string, vmIdFragment: string): Promise<SubChannelState | null> {
    // 1) Try local repository first (no side effects)
    const local = await this.channelRepo.getSubChannelState(channelId, vmIdFragment);
    if (local) return local;

    // 2) Fallback to chain: derive baseline (sync-from-chain is allowed to update repo)
    try {
      const [channelInfo, subInfo] = await Promise.all([
        this.getChannelInfoCached(channelId),
        this.contract.getSubChannel({ channelId, vmIdFragment }),
      ]);

      const derived: SubChannelState = {
        channelId,
        epoch: channelInfo.epoch,
        vmIdFragment: subInfo.vmIdFragment,
        lastClaimedAmount: subInfo.lastClaimedAmount,
        lastConfirmedNonce: subInfo.lastConfirmedNonce,
        lastUpdated: Date.now(),
      };

      // Sync to local repository as it's sourced from chain
      await this.channelRepo.updateSubChannelState(channelId, vmIdFragment, derived);
      return derived;
    } catch {
      // Chain fallback failed (e.g., sub-channel not authorized yet)
      return null;
    }
  }

  /**
   * Get the payee DID from this client's signer
   */
  async getPayeeDid(): Promise<string> {
    return await this.signer.getDid();
  }

  /**
   * Get the pending SubRAV repository used by this client
   */
  getPendingSubRAVRepository(): PendingSubRAVRepository {
    return this.pendingSubRAVRepo;
  } 

  // -------- Claims Management --------

  /**
   * Claim payment from a channel using a signed SubRAV
   */
  async claimFromChannel(options: ClaimOptions): Promise<ClaimResult> {
    const { signedSubRAV } = options;

    // Submit claim to blockchain
    const claimParams = {
      signedSubRAV,
      signer: this.signer,
    };

    const result = await this.contract.claimFromChannel(claimParams);
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
        const result = await this.claimFromChannel({ signedSubRAV });
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
    const metadata = await this.channelRepo.getChannelMetadata(channelId);
    if (metadata) {
      metadata.status = 'closed';
      await this.channelRepo.setChannelMetadata(channelId, metadata);
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
   * Get channel info with caching using ChannelRepository
   * This checks local storage first, then falls back to chain if not found or stale
   */
  private async getChannelInfoCached(channelId: string, forceRefresh: boolean = false): Promise<ChannelInfo> {
    // Try to get from local storage first (unless forced refresh)
    if (!forceRefresh) {
      const cachedMetadata = await this.channelRepo.getChannelMetadata(channelId);
      if (cachedMetadata) {
        // Convert ChannelMetadata to ChannelInfo
        return cachedMetadata;
      }
    }
    
    // Fetch from chain and cache
    try {
      const channelInfo = await this.contract.getChannelStatus({ channelId });
      
      // Store in cache as ChannelMetadata
      await this.channelRepo.setChannelMetadata(channelId, channelInfo);
      
      return channelInfo;
    } catch (error) {
      // If chain call fails and we have stale cache, use it
      if (!forceRefresh) {
        const staleMetadata = await this.channelRepo.getChannelMetadata(channelId);
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
    const storageResult = await this.channelRepo.listChannelMetadata(
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
   * Get cached chain ID or fetch from contract
   */
  private async getChainId(): Promise<bigint> {
    if (this.chainIdCache === undefined) {
      this.chainIdCache = await this.contract.getChainId();
    }
    return this.chainIdCache;
  }

  /**
   * Get a PaymentHubClient instance that reuses this client's contract and signer
   * Primarily useful for balance queries and withdraw operations on the payee side
   */
  getHubClient(): PaymentHubClient {
    return new PaymentHubClient({
      contract: this.contract,
      signer: this.signer,
      defaultAssetId: this.defaultAssetId,
    });
  }

  /**
   * Get channel health metrics
   */
  async getChannelHealth(channelId: string): Promise<{
    isHealthy: boolean;
    issues: string[];
    lastActivity?: Date;
    pendingClaims: number;
  }> {
    const issues: string[] = [];
    
    try {
      const channelInfo = await this.getChannelInfoCached(channelId);
      
      // Check if channel is closed
      if (channelInfo.status === 'closed') {
        issues.push('Channel is closed');
      }
      
      // Check if channel is closing
      if (channelInfo.status === 'closing') {
        issues.push('Channel is in closing state');
      }
      
      // In production, add more health checks like:
      // - Check for stuck transactions
      // - Monitor claim success rates
      // - Check for unusual nonce gaps
      
      return {
        isHealthy: issues.length === 0,
        issues,
        pendingClaims: 0 // Would query from contract/storage
      };
    } catch (error) {
      return {
        isHealthy: false,
        issues: [`Channel access failed: ${error}`],
        pendingClaims: 0
      };
    }
  }
} 