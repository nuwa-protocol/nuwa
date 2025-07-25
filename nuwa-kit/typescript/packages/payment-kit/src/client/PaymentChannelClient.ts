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
 * Provides high-level APIs for payment channel operations, state management,
 * and SubRAV generation while abstracting away blockchain-specific details.
 */
export class PaymentChannelClient {
  private contract: IPaymentChannelContract;
  private signer: SignerInterface;
  private defaultKeyId?: string;
  private subravManager: SubRAVManager;
  private stateStorage: ChannelStateStorage;

  constructor(options: PaymentChannelClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.defaultKeyId = options.keyId;
    this.subravManager = new SubRAVManager();
    
    // Initialize state storage
    if (options.storageOptions?.customStorage) {
      this.stateStorage = options.storageOptions.customStorage;
    } else {
      // Default to memory storage
      this.stateStorage = new MemoryChannelStateStorage();
    }
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
   * Open a new payment channel and authorize a sub-channel in one step
   * This is more efficient than calling openChannel() and authorizeSubChannel() separately
   */
  async openChannelWithSubChannel(params: {
    payeeDid: string;
    asset: AssetInfo;
    collateral: bigint;
    vmIdFragment?: string;
    keyId?: string;
  }): Promise<ChannelMetadata> {
    const payerDid = await this.signer.getDid();
    const useKeyId = params.keyId || this.defaultKeyId;
    const vmIdFragment = params.vmIdFragment || (useKeyId ? this.extractFragment(useKeyId) : 'default');
    
    if (!useKeyId) {
      throw new Error('No keyId specified and no default keyId set');
    }
    
    // Convert SignerInterface to chain-specific signer
    const chainSigner = await this.convertToChainSigner();
    
    const openParams: OpenChannelWithSubChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      collateral: params.collateral,
      vmIdFragment,
      signer: chainSigner,
    };

    const result = await this.contract.openChannelWithSubChannel(openParams);
    
    // Get channel epoch from the contract
    const channelInfo = await this.contract.getChannelStatus({ channelId: result.channelId });

    const metadata: ChannelMetadata = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      totalCollateral: params.collateral,
      epoch: channelInfo.epoch,
      status: 'active',
    };

    // Cache channel metadata using channelId as key
    await this.stateStorage.setChannelMetadata(result.channelId, metadata);
    
    // Initialize sub-channel state for the authorized keyId
    await this.stateStorage.updateSubChannelState(useKeyId, {
      channelId: result.channelId,
      epoch: channelInfo.epoch,
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
    });
    
    return metadata;
  }

  /**
   * Authorize a sub-channel for multi-device support
   */
  async authorizeSubChannel(params: {
    channelId: string;
    vmIdFragment?: string;
    keyId?: string;
  }): Promise<{ txHash: string }> {
    const useKeyId = params.keyId || this.defaultKeyId;
    const vmIdFragment = params.vmIdFragment || (useKeyId ? this.extractFragment(useKeyId) : 'default');
    
    if (!useKeyId) {
      throw new Error('No keyId specified and no default keyId set');
    }
    
    const chainSigner = await this.convertToChainSigner();

    const result = await this.contract.authorizeSubChannel({
      channelId: params.channelId,
      vmIdFragment,
      signer: chainSigner,
    });

    // Get channel metadata for epoch information
    const metadata = await this.stateStorage.getChannelMetadata(params.channelId);
    const channelEpoch = metadata?.epoch || BigInt(0);
    
    // Initialize sub-channel state for the authorized keyId
    await this.stateStorage.updateSubChannelState(useKeyId, {
      channelId: params.channelId,
      epoch: channelEpoch,
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
    });

    return { txHash: result.txHash };
  }

  /**
   * Generate next SubRAV for payment
   */
  async nextSubRAV(deltaAmount: bigint, keyId?: string): Promise<SignedSubRAV> {
    const useKeyId = keyId || this.defaultKeyId;
    if (!useKeyId) {
      throw new Error('No keyId specified and no default keyId set');
    }

    // Get current state from cache
    const state = await this.stateStorage.getSubChannelState(useKeyId);
    
    if (!state.channelId || state.channelId === 'default') {
      throw new Error(`No active channel found for keyId ${useKeyId}. Please open a channel and authorize the sub-channel first.`);
    }
    
    const subRav: SubRAV = {
      version: 1,
      chainId: await this.getChainId(),
      channelId: state.channelId,
      channelEpoch: state.epoch,
      vmIdFragment: this.extractFragment(useKeyId),
      accumulatedAmount: state.accumulatedAmount + deltaAmount,
      nonce: state.nonce + BigInt(1),
    };

    const signed = await this.subravManager.sign(subRav, this.signer, useKeyId);
    
    // Update cache
    await this.stateStorage.updateSubChannelState(useKeyId, {
      accumulatedAmount: subRav.accumulatedAmount,
      nonce: subRav.nonce,
    });

    return signed;
  }

  /**
   * Submit claim to blockchain
   */
  async submitClaim(signedSubRAV: SignedSubRAV): Promise<ClaimResult> {
    const chainSigner = await this.convertToChainSigner();
    
    const claimParams: ClaimParams = {
      signedSubRAV,
      signer: chainSigner,
    };

    return this.contract.claimFromChannel(claimParams);
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
   * Find channels by payer DID (useful for listing user's channels)
   */
  async getChannelsByPayer(): Promise<ChannelMetadata[]> {
    const payerDid = await this.signer.getDid();
    const allChannels = await this.stateStorage.listChannelMetadata();
    return allChannels.filter(channel => channel.payerDid === payerDid);
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

  private async getChainId(): Promise<bigint> {
    // Get chain ID from contract instead of hardcoding
    return this.contract.getChainId();
  }

  private extractFragment(keyId: string): string {
    // Extract DID verification method fragment from keyId
    const parts = keyId.split('#');
    return parts[parts.length - 1] || keyId;
  }
}

 