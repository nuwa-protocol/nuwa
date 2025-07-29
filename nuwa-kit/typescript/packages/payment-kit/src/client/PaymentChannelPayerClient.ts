/**
 * Chain-agnostic Payment Channel Payer Client
 * 
 * This client provides a unified interface for payment channel operations
 * from the Payer perspective, using the IPaymentChannelContract abstraction.
 */

import type {
  AssetInfo,
  SubChannelState,
  ChannelInfo,
  SignedSubRAV,
  SubRAV,
} from '../core/types';
import type { 
  IPaymentChannelContract, 
  OpenChannelResult,
  OpenChannelParams as ContractOpenChannelParams,
  OpenChannelWithSubChannelParams as ContractOpenChannelWithSubChannelParams,
} from '../contracts/IPaymentChannelContract';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { ChannelRepository } from '../storage/interfaces/ChannelRepository';
import { createChannelRepoAuto } from '../storage/factories/createChannelRepo';
import { SubRAVManager } from '../core/SubRav';

export interface PayerOpenChannelParams {
  payeeDid: string;
  assetId: string;
  collateral: bigint;
}

export interface PayerOpenChannelWithSubChannelParams {
  payeeDid: string;
  assetId: string;
  collateral: bigint;
  vmIdFragment?: string;
}

/**
 * Storage options for PaymentChannelPayerClient
 */
export interface PayerStorageOptions {
  /** Storage type selection */
  backend?: 'memory' | 'indexeddb' | 'sql';
  /** Custom storage implementation */
  customChannelRepo?: ChannelRepository;
  /** PostgreSQL connection pool for SQL backend */
  pool?: any;
  /** Table name prefix for SQL backends */
  tablePrefix?: string;
}

export interface PaymentChannelPayerClientOptions {
  contract: IPaymentChannelContract;
  signer: SignerInterface;
  keyId?: string;
  storageOptions?: PayerStorageOptions;
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
  private ravManager: SubRAVManager;
  private chainIdCache?: bigint;
  private activeChannelId?: string;

  constructor(options: PaymentChannelPayerClientOptions) {
    this.contract = options.contract;
    this.signer = options.signer;
    this.keyId = options.keyId;
    
    // Initialize storage
    if (options.storageOptions?.customChannelRepo) {
      this.channelRepo = options.storageOptions.customChannelRepo;
    } else {
      this.channelRepo = createChannelRepoAuto({
        pool: options.storageOptions?.pool,
        tablePrefix: options.storageOptions?.tablePrefix,
      });
    }
    
    this.ravManager = new SubRAVManager();
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
      collateral: params.collateral,
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
  async openChannelWithSubChannel(params: PayerOpenChannelWithSubChannelParams): Promise<OpenChannelResult> {
    const payerDid = await this.signer.getDid();
    const useFragment = params.vmIdFragment || this.extractFragment(this.keyId || '');
    
    const openParams: ContractOpenChannelWithSubChannelParams = {
      payerDid,
      payeeDid: params.payeeDid,
      assetId: params.assetId,
      collateral: params.collateral,
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
    const keyId = this.keyId || `${payerDid}#${useFragment}`;
    await this.channelRepo.updateSubChannelState(result.channelId, keyId, {
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
    await this.channelRepo.updateSubChannelState(params.channelId, keyId, {
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
   * This is used by API clients to approve payment requests from services
   */
  async signSubRAV(subRAV: SubRAV, options: SignSubRAVOptions = {}): Promise<SignedSubRAV> {
    const { validateBeforeSigning = true, maxAmount } = options;

    // Optional pre-signing validation
    if (validateBeforeSigning) {
      await this.validateSubRAVForSigning(subRAV, maxAmount);
    }

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
    const signedSubRAV = await this.ravManager.sign(subRAV, this.signer, useKeyId);

    // Update local state to track this payment
    await this.channelRepo.updateSubChannelState(subRAV.channelId, useKeyId, {
      channelId: subRAV.channelId,
      epoch: subRAV.channelEpoch,
      accumulatedAmount: subRAV.accumulatedAmount,
      nonce: subRAV.nonce,
      lastUpdated: Date.now(),
    });

    return signedSubRAV;
  }

  /**
   * Validate a SubRAV before signing it
   * This performs client-side business logic checks
   */
  private async validateSubRAVForSigning(subRAV: SubRAV, maxAmount?: bigint): Promise<void> {
    // 1. Verify channel exists and is active
    const channelInfo = await this.contract.getChannelStatus({ channelId: subRAV.channelId });
    if (channelInfo.status !== 'active') {
      throw new Error(`Cannot sign SubRAV for inactive channel: ${channelInfo.status}`);
    }

    // 2. Verify epoch matches
    if (channelInfo.epoch !== subRAV.channelEpoch) {
      throw new Error(`Epoch mismatch: channel ${channelInfo.epoch}, SubRAV ${subRAV.channelEpoch}`);
    }

    // 3. Check against maximum amount limit
    if (maxAmount && subRAV.accumulatedAmount > maxAmount) {
      throw new Error(`SubRAV amount ${subRAV.accumulatedAmount} exceeds maximum allowed ${maxAmount}`);
    }

    // 4. Verify nonce progression (if we have previous state)
    const payerDid = await this.signer.getDid();
    const keyId = `${payerDid}#${subRAV.vmIdFragment}`;
    
    try {
      const prevState = await this.channelRepo.getSubChannelState(subRAV.channelId, keyId);
      
      // Verify nonce increments by 1
      const expectedNonce = prevState.nonce + BigInt(1);
      if (subRAV.nonce !== expectedNonce) {
        throw new Error(`Invalid nonce: expected ${expectedNonce}, got ${subRAV.nonce}`);
      }

      // Verify amount only increases
      if (subRAV.accumulatedAmount <= prevState.accumulatedAmount) {
        throw new Error(`Amount must increase: previous ${prevState.accumulatedAmount}, new ${subRAV.accumulatedAmount}`);
      }
    } catch (error) {
      // No previous state - this could be handshake (nonce = 0) or first payment (nonce = 1)
      if (subRAV.nonce !== BigInt(0) && subRAV.nonce !== BigInt(1)) {
        throw new Error(`First SubRAV must have nonce 0 (handshake) or 1 (first payment), got ${subRAV.nonce}`);
      }
      
      // Additional validation for handshake
      if (subRAV.nonce === BigInt(0) && subRAV.accumulatedAmount !== BigInt(0)) {
        throw new Error(`Handshake SubRAV (nonce=0) must have zero amount, got ${subRAV.accumulatedAmount}`);
      }
    }

    // 5. Verify chain ID matches
    const expectedChainId = await this.getChainId();
    if (subRAV.chainId !== expectedChainId) {
      throw new Error(`Chain ID mismatch: expected ${expectedChainId}, got ${subRAV.chainId}`);
    }
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

  // -------- Private Helpers --------

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
    const result = await this.channelRepo.listChannelMetadata(
      { status: 'active' }, 
      { offset: 0, limit: 1 }
    );
    
    return result.items.length > 0 ? result.items[0].channelId : null;
  }
}
