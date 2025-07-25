/**
 * Chain-agnostic Payment Channel Payer Client
 * 
 * This client provides a unified interface for payment channel operations
 * from the Payer perspective, using the IPaymentChannelContract abstraction.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type {
  IPaymentChannelContract,
  OpenChannelParams,
  OpenChannelResult,
  OpenChannelWithSubChannelParams,
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

export interface PaymentChannelPayerClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  keyId?: string;
  storageOptions?: StorageOptions;
}

export interface NextSubRAVOptions {
  channelId?: string;
  keyId?: string;
}

/**
 * Chain-agnostic Payment Channel Payer Client
 * 
 * Provides high-level APIs for payment channel operations from the Payer perspective:
 * - Opening channels and authorizing sub-channels
 * - Generating and managing SubRAVs
 * - Multi-channel support with flexible switching
 * 
 * Uses composite keys (channelId:keyId) to avoid conflicts between channels.
 * Supports both single-channel (auto-select first active) and multi-channel usage.
 */
export class PaymentChannelPayerClient {
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private keyId?: string;
  private stateStorage: ChannelStateStorage;
  private ravManager: SubRAVManager;
  private chainIdCache?: bigint;
  private activeChannelId?: string;

  constructor(options: PaymentChannelPayerClientOptions) {
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
    
    // Set as active channel if no active channel is set
    if (!this.activeChannelId) {
      this.activeChannelId = result.channelId;
    }
    
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

    // Set as active channel if no active channel is set
    if (!this.activeChannelId) {
      this.activeChannelId = result.channelId;
    }

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
   * Set the active channel for subsequent operations
   * This is a convenience method for single-channel usage patterns
   */
  async setActiveChannel(channelId: string): Promise<void> {
    // Verify the channel exists and is active
    const metadata = await this.stateStorage.getChannelMetadata(channelId);
    if (!metadata) {
      throw new Error(`Channel ${channelId} not found in local storage`);
    }
    if (metadata.status !== 'active') {
      throw new Error(`Channel ${channelId} is not active (status: ${metadata.status})`);
    }
    
    this.activeChannelId = channelId;
  }

  /**
   * Generate next SubRAV for payment
   * Supports both single-channel (auto-select) and multi-channel (explicit channelId) usage
   */
  async nextSubRAV(amount: bigint, options: NextSubRAVOptions = {}): Promise<SignedSubRAV> {
    const useKeyId = options.keyId || this.keyId;
    if (!useKeyId) {
      throw new Error('Key ID is required for RAV generation');
    }

    // Determine target channel: explicit > active > first active
    let channelId = options.channelId;
    if (!channelId) {
      channelId = this.activeChannelId || (await this.getFirstActiveChannelId()) || undefined;
    }
    
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

    // Clear active channel if this was the active one
    if (this.activeChannelId === channelId) {
      this.activeChannelId = undefined;
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

  /**
   * Get the currently active channel ID
   */
  getActiveChannelId(): string | undefined {
    return this.activeChannelId;
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
   * Get first active channel ID (fallback for auto-selection)
   */
  private async getFirstActiveChannelId(): Promise<string | null> {
    const result = await this.stateStorage.listChannelMetadata(
      { status: 'active' }, 
      { offset: 0, limit: 1 }
    );
    
    return result.items.length > 0 ? result.items[0].channelId : null;
  }
}
