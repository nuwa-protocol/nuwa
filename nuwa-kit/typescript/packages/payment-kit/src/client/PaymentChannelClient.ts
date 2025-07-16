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
  ClaimParams,
  ClaimResult,
  ChannelInfo,
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

    // Cache channel metadata
    await this.stateStorage.setChannelMetadata(result.channelId, metadata);
    
    return metadata;
  }

  /**
   * Authorize a sub-channel for multi-device support
   */
  async authorizeSubChannel(params: {
    channelId?: string;
    vmIdFragment: string;
  }): Promise<{ txHash: string }> {
    const channelId = params.channelId || await this.getDefaultChannelId();
    const chainSigner = await this.convertToChainSigner();

    // Get public key and method type from signer
    // TODO: Implement proper key extraction from SignerInterface
    // For now, use placeholder values
    const publicKey = 'placeholder-public-key';
    const methodType = 'secp256k1';

    const result = await this.contract.authorizeSubChannel({
      channelId,
      vmIdFragment: params.vmIdFragment,
      publicKey,
      methodType,
      signer: chainSigner,
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
  async closeChannel(channelId?: string, cooperative: boolean = true): Promise<{ txHash: string }> {
    const useChannelId = channelId || await this.getDefaultChannelId();
    const chainSigner = await this.convertToChainSigner();

    const result = await this.contract.closeChannel({
      channelId: useChannelId,
      cooperative,
      signer: chainSigner,
    });

    // Update cache to mark channel as closed
    const metadata = await this.stateStorage.getChannelMetadata(useChannelId);
    if (metadata) {
      metadata.status = 'closed';
      await this.stateStorage.setChannelMetadata(useChannelId, metadata);
    }

    return { txHash: result.txHash };
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId?: string): Promise<ChannelInfo> {
    const useChannelId = channelId || await this.getDefaultChannelId();
    return this.contract.getChannelStatus({ channelId: useChannelId });
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
    // TODO: Get chain ID from contract or configuration
    // For now, hardcode Rooch testnet
    return BigInt(4);
  }

  private async getDefaultChannelId(): Promise<string> {
    // Get the most recent channel ID from cache
    // This is a simplified implementation
    const metadata = await this.stateStorage.getChannelMetadata('default');
    if (!metadata) {
      throw new Error('No default channel found. Please open a channel first.');
    }
    return metadata.channelId;
  }

  private extractFragment(keyId: string): string {
    // Extract DID verification method fragment from keyId
    const parts = keyId.split('#');
    return parts[parts.length - 1] || keyId;
  }
}

 