/**
 * Chain-agnostic Payment Channel Client
 * 
 * This client provides a unified interface for payment channel operations
 * across different blockchains, using the IPaymentChannelContract abstraction.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type {
  IPaymentChannelContract,
  OpenChannelParams,
  OpenChannelResult,
  OpenChannelWithSubChannelParams,
  ClaimParams,
  ClaimResult,
  ChannelInfo,
} from '../contracts/IPaymentChannelContract';
import type {
  AssetInfo,
  SignedSubRAV,
  SubRAV,
  ChannelMetadata,
  SubChannelState,
} from '../core/types';
import { SubRAVManager } from '../core/subrav';
import { ChannelStateStorage, MemoryChannelStateStorage, StorageOptions } from '../core/ChannelStateStorage';

export interface PaymentChannelClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  keyId?: string;
  storageOptions?: StorageOptions;
}

/**
 * Chain-agnostic Payment Channel Client
 * 
 * Provides high-level APIs for payment channel operations including:
 * - Opening channels and authorizing sub-channels
 * - Generating and managing SubRAVs
 * - Claiming payments from channels
 * 
 * Uses composite keys (channelId:keyId) to avoid conflicts between channels.
 */
export class PaymentChannelClient {
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private keyId?: string;
  private stateStorage: ChannelStateStorage;
  private ravManager: SubRAVManager;
  private chainIdCache?: bigint;

  constructor(options: PaymentChannelClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.keyId = options.keyId;
    
    // Initialize storage
    if (options.storageOptions?.customStorage) {
      this.stateStorage = options.storageOptions.customStorage;
    } else {
      this.stateStorage = new MemoryChannelStateStorage();
    }
    
    this.ravManager = new SubRAVManager();
  }

  // -------- Channel Management --------

  /**
   * Open a new payment channel
   */
  async openChannel(params: {
    payeeDid: string;
    asset: AssetInfo;
    collateral: bigint;
  }): Promise<ChannelMetadata> {
    const payerDid = await this.signer.getDid();
    
    // Convert SignerInterface to chain-specific signer
    const chainSigner = await this.convertToChainSigner();
    
    const openParams: OpenChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      collateral: params.collateral,
      signer: chainSigner,
    };

    const result = await this.contract.openChannel(openParams);

    const metadata: ChannelMetadata = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      totalCollateral: params.collateral,
      epoch: BigInt(0),
      status: 'active',
    };

    // Cache channel metadata using channelId as key
    await this.stateStorage.setChannelMetadata(result.channelId, metadata);
    
    return metadata;
  }

  /**
   * Open a new payment channel and authorize a sub-channel in one transaction
   */
  async openChannelWithSubChannel(params: {
    payeeDid: string;
    asset: AssetInfo;
    collateral: bigint;
    vmIdFragment?: string;
  }): Promise<OpenChannelResult> {
    const payerDid = await this.signer.getDid();
    const useFragment = params.vmIdFragment || this.extractFragment(this.keyId || '');
    
    const openParams: OpenChannelWithSubChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      collateral: params.collateral,
      vmIdFragment: useFragment,
      signer: this.signer,
    };

    const result = await this.contract.openChannelWithSubChannel(openParams);

    // Cache channel metadata
    const metadata: ChannelMetadata = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      totalCollateral: params.collateral,
      epoch: BigInt(0),
      status: 'active',
    };

    await this.stateStorage.setChannelMetadata(result.channelId, metadata);

    // Initialize sub-channel state for this key
    const keyId = this.keyId || `${payerDid}#${useFragment}`;
    await this.stateStorage.updateSubChannelState(result.channelId, keyId, {
      channelId: result.channelId,
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    });

    return result;
  }

  /**
   * Authorize a sub-channel for an existing channel
   */
  async authorizeSubChannel(params: {
    channelId: string;
    vmIdFragment?: string;
  }): Promise<void> {
    const payerDid = await this.signer.getDid();
    const useFragment = params.vmIdFragment || this.extractFragment(this.keyId || '');
    
    await this.contract.authorizeSubChannel({
      channelId: params.channelId,
      vmIdFragment: useFragment,
      signer: this.signer,
    });

    // Initialize sub-channel state
    const keyId = this.keyId || `${payerDid}#${useFragment}`;
    await this.stateStorage.updateSubChannelState(params.channelId, keyId, {
      channelId: params.channelId,
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    });
  }

  /**
   * Generate next SubRAV for payment
   */
  async nextSubRAV(amount: bigint, keyId?: string): Promise<SignedSubRAV> {
    const useKeyId = keyId || this.keyId;
    if (!useKeyId) {
      throw new Error('Key ID is required for RAV generation');
    }

    // Get current channel - we need a specific channel ID now
    const channelId = await this.getActiveChannelId();
    if (!channelId) {
      throw new Error('No active payment channel found. Please open a channel first.');
    }

    const state = await this.stateStorage.getSubChannelState(channelId, useKeyId);
    const channelMeta = await this.stateStorage.getChannelMetadata(channelId);
    
    if (!channelMeta) {
      throw new Error(`Channel metadata not found for channel ${channelId}`);
    }

    const chainId = await this.getChainId();
    const newNonce = state.nonce + BigInt(1);
    const newAmount = state.accumulatedAmount + amount;

    const subRAV: SubRAV = {
      version: 1,
      chainId: BigInt(chainId),
      channelId: channelId,
      channelEpoch: state.epoch,
      vmIdFragment: useKeyId.split('#')[1] || useKeyId,
      accumulatedAmount: newAmount,
      nonce: newNonce,
    };

    const signedSubRAV = await this.ravManager.sign(subRAV, this.signer, useKeyId);

    // Update local state
    await this.stateStorage.updateSubChannelState(channelId, useKeyId, {
      nonce: newNonce,
      accumulatedAmount: newAmount,
      lastUpdated: Date.now(),
    });

    return signedSubRAV;
  }

  /**
   * Submit a claim to the blockchain
   */
  async submitClaim(signedSubRAV: SignedSubRAV): Promise<ClaimResult> {
    return await this.contract.claimFromChannel({
      signedSubRAV,
      signer: this.signer,
    });
  }

  /**
   * Close a payment channel
   */
  async closeChannel(channelId: string, cooperative: boolean = true): Promise<{ txHash: string }> {
    const chainSigner = await this.convertToChainSigner();

    const result = await this.contract.closeChannel({
      channelId,
      cooperative,
      signer: chainSigner,
    });

    // Update cache to mark channel as closed
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
   * Get channels for the current payer
   */
  async getChannelsByPayer(payerDid: string): Promise<ChannelMetadata[]> {
    const result = await this.stateStorage.listChannelMetadata({ payerDid });
    return result.items;
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

  private async convertToChainSigner(): Promise<SignerInterface> {
    // The interface now uses SignerInterface directly, so no conversion needed
    // Each chain implementation (like RoochPaymentChannelContract) handles 
    // the conversion from SignerInterface to their specific signer type
    return this.signer;
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
   * Extract fragment from full key ID
   */
  private extractFragment(keyId: string): string {
    const parts = keyId.split('#');
    return parts[parts.length - 1] || keyId;
  }

  /**
   * Get active channel ID (helper method to replace the old default channel concept)
   */
  private async getActiveChannelId(): Promise<string | null> {
    // For now, get the first active channel
    // In the future, this could be more sophisticated (last used, highest balance, etc.)
    const result = await this.stateStorage.listChannelMetadata(
      { status: 'active' }, 
      { offset: 0, limit: 1 }
    );
    
    return result.items.length > 0 ? result.items[0].channelId : null;
  }
}

 