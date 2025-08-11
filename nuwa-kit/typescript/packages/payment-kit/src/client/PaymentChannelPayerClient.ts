/**
 * Chain-agnostic Payment Channel Payer Client
 *
 * This client provides a unified interface for payment channel operations
 * from the Payer perspective, using the IPaymentChannelContract abstraction.
 */

import type { AssetInfo, SubChannelState, ChannelInfo, SignedSubRAV, SubRAV } from '../core/types';
import type {
  IPaymentChannelContract,
  OpenChannelResult,
  OpenChannelParams as ContractOpenChannelParams,
  OpenChannelWithSubChannelParams as ContractOpenChannelWithSubChannelParams,
} from '../contracts/IPaymentChannelContract';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { ChannelRepository } from '../storage/interfaces/ChannelRepository';
import { SubRAVSigner } from '../core/SubRav';
import { PaymentHubClient } from './PaymentHubClient';

export interface PayerOpenChannelParams {
  payeeDid: string;
  assetId: string;
}

export interface PayerOpenChannelWithSubChannelParams {
  payeeDid: string;
  assetId: string;
  vmIdFragment?: string;
}

/**
 * Storage options for PaymentChannelPayerClient
 */
export interface PayerStorageOptions {
  channelRepo: ChannelRepository;
}

export interface PaymentChannelPayerClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  keyId?: string;
  storageOptions: PayerStorageOptions;
}

export interface NextSubRAVOptions {
  channelId?: string;
  keyId?: string;
}

export interface SignSubRAVOptions {
  validateBeforeSigning?: boolean;
  maxAmount?: bigint; // Optional: refuse to sign if amount exceeds this limit
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
  private channelRepo: ChannelRepository;
  private chainIdCache?: bigint;
  private activeChannelId?: string;
  private defaultAssetId: string;

  constructor(options: PaymentChannelPayerClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.keyId = options.keyId;
    this.defaultAssetId = '0x3::gas_coin::RGas';
    // Initialize storage
    this.channelRepo = options.storageOptions.channelRepo;
  }

  // -------- Channel Management --------

  /**
   * Open a new payment channel
   */
  async openChannel(params: PayerOpenChannelParams): Promise<ChannelInfo> {
    const payerDid = await this.signer.getDid();

    const openParams: ContractOpenChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      assetId: params.assetId,
      signer: this.signer,
    };

    const result = await this.contract.openChannel(openParams);

    const channelInfo: ChannelInfo = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      assetId: params.assetId,
      epoch: BigInt(0),
      status: 'active',
    };

    // Cache channel metadata using channelId as key
    await this.channelRepo.setChannelMetadata(result.channelId, channelInfo);

    // Set as active channel if no active channel is set
    if (!this.activeChannelId) {
      this.activeChannelId = result.channelId;
    }

    return channelInfo;
  }

  /**
   * Open a payment channel with a sub-channel in one transaction
   */
  async openChannelWithSubChannel(
    params: PayerOpenChannelWithSubChannelParams
  ): Promise<OpenChannelResult> {
    const payerDid = await this.signer.getDid();
    const useFragment = params.vmIdFragment || this.extractFragment(this.keyId || '');

    const openParams: ContractOpenChannelWithSubChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      assetId: params.assetId,
      vmIdFragment: useFragment,
      signer: this.signer,
    };

    const result = await this.contract.openChannelWithSubChannel(openParams);

    // Cache channel metadata
    const metadata: ChannelInfo = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      assetId: params.assetId,
      epoch: BigInt(0),
      status: 'active',
    };

    await this.channelRepo.setChannelMetadata(result.channelId, metadata);

    // Initialize sub-channel state for this key
    await this.channelRepo.updateSubChannelState(result.channelId, useFragment, {
      channelId: result.channelId,
      epoch: BigInt(0),
      vmIdFragment: useFragment,
      lastClaimedAmount: BigInt(0),
      lastConfirmedNonce: BigInt(0),
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
  async authorizeSubChannel(params: { channelId: string; vmIdFragment?: string }): Promise<void> {
    const payerDid = await this.signer.getDid();
    const useFragment = params.vmIdFragment || this.extractFragment(this.keyId || '');

    await this.contract.authorizeSubChannel({
      channelId: params.channelId,
      vmIdFragment: useFragment,
      signer: this.signer,
    });

    // Initialize sub-channel state
    await this.channelRepo.updateSubChannelState(params.channelId, useFragment, {
      channelId: params.channelId,
      epoch: BigInt(0),
      vmIdFragment: useFragment,
      lastClaimedAmount: BigInt(0),
      lastConfirmedNonce: BigInt(0),
      lastUpdated: Date.now(),
    });
  }

  /**
   * Set the active channel for subsequent operations
   * This is a convenience method for single-channel usage patterns
   */
  async setActiveChannel(channelId: string): Promise<void> {
    // Verify the channel exists and is active
    const metadata = await this.channelRepo.getChannelMetadata(channelId);
    if (!metadata) {
      throw new Error(`Channel ${channelId} not found in local storage`);
    }
    if (metadata.status !== 'active') {
      throw new Error(`Channel ${channelId} is not active (status: ${metadata.status})`);
    }

    this.activeChannelId = channelId;
  }

  // -------- SubRAV Signing (for API clients) --------

  /**
   * Sign a SubRAV generated by a service provider
   * The caller should validate the SubRAV with previous rav before signing it
   * This is used by API clients to approve payment requests from services
   */
  async signSubRAV(subRAV: SubRAV): Promise<SignedSubRAV> {
    await this.validateSubRAV(subRAV);
    // Determine which key to use for signing
    const payerDid = await this.signer.getDid();
    const expectedKeyId = `${payerDid}#${subRAV.vmIdFragment}`;

    // Use the keyId that matches the SubRAV's vmIdFragment
    const useKeyId = this.keyId || expectedKeyId;

    // Verify that our keyId matches the SubRAV
    const ourFragment = this.extractFragment(useKeyId);
    if (ourFragment !== subRAV.vmIdFragment) {
      throw new Error(`Key fragment mismatch: our ${ourFragment}, SubRAV ${subRAV.vmIdFragment}`);
    }

    // Sign the SubRAV
    const signedSubRAV = SubRAVSigner.sign(subRAV, this.signer, useKeyId);

    return signedSubRAV;
  }

  /**
   * Validate a SubRAV via on chain information
   */
  private async validateSubRAV(subRAV: SubRAV): Promise<void> {
    // 1. Verify channel exists and is active
    const channelInfo = await this.contract.getChannelStatus({ channelId: subRAV.channelId });

    // 2. Verify epoch matches
    if (channelInfo.epoch !== subRAV.channelEpoch) {
      throw new Error(
        `Epoch mismatch: channel ${channelInfo.epoch}, SubRAV ${subRAV.channelEpoch}`
      );
    }

    // When the subchannel is created, the nonce is 0
    if (subRAV.nonce === BigInt(0)) {
      throw new Error(`SubRAV nonce cannot be 0`);
    }

    const expectedChainId = await this.getChainId();
    if (subRAV.chainId !== expectedChainId) {
      throw new Error(`Chain ID mismatch: expected ${expectedChainId}, got ${subRAV.chainId}`);
    }
  }

  /**
   * Get a PaymentHubClient instance that reuses this client's contract and signer
   * This is the recommended way to access payment hub operations
   */
  getHubClient(): PaymentHubClient {
    return new PaymentHubClient({
      contract: this.contract,
      signer: this.signer,
      defaultAssetId: this.defaultAssetId,
    });
  }

  /**
   * Close a payment channel
   */
  async closeChannel(channelId: string, cooperative: boolean = true): Promise<{ txHash: string }> {
    const result = await this.contract.closeChannel({
      channelId,
      cooperative,
      signer: this.signer,
    });

    // Update cache to mark channel as closed
    const metadata = await this.channelRepo.getChannelMetadata(channelId);
    if (metadata) {
      metadata.status = 'closed';
      await this.channelRepo.setChannelMetadata(channelId, metadata);
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
  async getChannelsByPayer(payerDid: string): Promise<ChannelInfo[]> {
    const result = await this.channelRepo.listChannelMetadata({ payerDid });
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

  public async getChainId(): Promise<bigint> {
    if (this.chainIdCache === undefined) {
      this.chainIdCache = await this.contract.getChainId();
    }
    return this.chainIdCache;
  }

  // -------- Private Helpers --------

  /**
   * Extract fragment from full key ID
   */
  private extractFragment(keyId: string): string {
    const parts = keyId.split('#');
    return parts[parts.length - 1] || keyId;
  }
}
