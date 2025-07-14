/**
 * High-level Rooch Payment Channel Client
 * Provides user-friendly API for payment channel operations
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import { DidAccountSigner } from '@nuwa-ai/identity-kit';
import { RoochPaymentChannelContract } from './contract';
import type { 
  ChannelMetadata, 
  AssetInfo, 
  SignedSubRAV, 
  SubChannelState, 
  TransactionResult 
} from '../core/types';
import { SubRAVSigner, SubRAVUtils } from '../core/subrav';
import { generateNonce, extractFragment } from '../utils';

export interface PaymentChannelClientOptions {
  rpcUrl: string;
  signer: SignerInterface;
  keyId?: string;
  contractAddress?: string;
  debug?: boolean;
}

/**
 * High-level client for Rooch payment channel operations
 */
export class RoochPaymentChannelClient {
  private contract: RoochPaymentChannelContract;
  private signer: SignerInterface;
  private defaultKeyId?: string;
  private stateCache: Map<string, SubChannelState> = new Map();

  constructor(options: PaymentChannelClientOptions) {
    this.contract = new RoochPaymentChannelContract({
      rpcUrl: options.rpcUrl,
      contractAddress: options.contractAddress,
      debug: options.debug,
    });
    this.signer = options.signer;
    this.defaultKeyId = options.keyId;
  }

  /**
   * Open a new payment channel
   */
  async openChannel(params: {
    payeeDid: string;
    asset: AssetInfo;
    collateral: bigint;
  }): Promise<ChannelMetadata> {
    const payerDid = await this.signer.getDid();
    
    // TODO: Convert SignerInterface to Rooch Signer when SDK integration is ready
    const roochSigner = await this.convertToRoochSigner();
    
    const result = await this.contract.openChannel({
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      collateral: params.collateral,
      signer: roochSigner,
    });

    const metadata: ChannelMetadata = {
      channelId: result.channelId,
      payerDid,
      payeeDid: params.payeeDid,
      asset: params.asset,
      totalCollateral: params.collateral,
      epoch: BigInt(0),
      status: 'active',
    };

    return metadata;
  }

  /**
   * Authorize a sub-channel for a specific verification method
   */
  async authorizeSubChannel(params: {
    channelId?: string;
    vmIdFragment: string;
    keyId?: string;
  }): Promise<void> {
    const keyId = params.keyId || this.defaultKeyId;
    if (!keyId) {
      throw new Error('No keyId specified and no default keyId set');
    }

    // Get key info from signer
    const keyInfo = await this.signer.getKeyInfo(keyId);
    if (!keyInfo) {
      throw new Error(`Key not found: ${keyId}`);
    }

    // TODO: Convert public key to appropriate format
    const publicKeyHex = Array.from(keyInfo.publicKey)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');

    const roochSigner = await this.convertToRoochSigner();

    // TODO: Get actual channel ID from state or parameter
    const channelId = params.channelId || 'placeholder-channel-id';

    await this.contract.authorizeSubChannel({
      channelId,
      vmIdFragment: params.vmIdFragment,
      publicKey: publicKeyHex,
      methodType: keyInfo.type,
      signer: roochSigner,
    });

    // Initialize sub-channel state
    this.stateCache.set(keyId, {
      channelId,
      epoch: BigInt(0),
      accumulatedAmount: BigInt(0),
      nonce: BigInt(0),
      lastUpdated: Date.now(),
    });
  }

  /**
   * Generate next SubRAV for payment
   */
  async nextSubRAV(deltaAmount: bigint, keyId?: string): Promise<SignedSubRAV> {
    const effectiveKeyId = keyId || this.defaultKeyId;
    if (!effectiveKeyId) {
      throw new Error('No keyId specified and no default keyId set');
    }

    // Get current sub-channel state
    const state = this.stateCache.get(effectiveKeyId);
    if (!state) {
      throw new Error(`Sub-channel not initialized for keyId: ${effectiveKeyId}`);
    }

    // Create new SubRAV
    const subRav = SubRAVUtils.create({
      chainId: BigInt(4), // TODO: Get actual chain ID
      channelId: state.channelId,
      channelEpoch: state.epoch,
      vmIdFragment: extractFragment(effectiveKeyId),
      accumulatedAmount: state.accumulatedAmount + deltaAmount,
      nonce: state.nonce + BigInt(1),
    });

    // Sign the SubRAV
    const signedSubRAV = await SubRAVSigner.sign(subRav, this.signer, effectiveKeyId);

    // Update local state
    this.stateCache.set(effectiveKeyId, {
      ...state,
      accumulatedAmount: subRav.accumulatedAmount,
      nonce: subRav.nonce,
      lastUpdated: Date.now(),
    });

    return signedSubRAV;
  }

  /**
   * Submit a SubRAV for on-chain claiming
   */
  async submitClaim(signedSubRAV: SignedSubRAV): Promise<TransactionResult> {
    const roochSigner = await this.convertToRoochSigner();
    
    const result = await this.contract.claimFromChannel({
      signedSubRAV,
      signer: roochSigner,
    });

    return {
      txHash: result.txHash,
      success: true, // TODO: Parse actual transaction result
    };
  }

  /**
   * Close a payment channel
   */
  async closeChannel(channelId: string, cooperative: boolean = true): Promise<TransactionResult> {
    const roochSigner = await this.convertToRoochSigner();
    
    // TODO: Collect final SubRAVs from all active sub-channels
    const finalSubRAVs: SignedSubRAV[] = [];

    const result = await this.contract.closeChannel({
      channelId,
      finalSubRAVs,
      cooperative,
      signer: roochSigner,
    });

    return {
      txHash: result.txHash,
      success: true,
    };
  }

  /**
   * Get channel status
   */
  async getChannelStatus(channelId: string): Promise<{
    exists: boolean;
    metadata?: ChannelMetadata;
  }> {
    const status = await this.contract.getChannelStatus(channelId);
    
    if (!status.exists) {
      return { exists: false };
    }

    const metadata: ChannelMetadata = {
      channelId,
      payerDid: status.payer!,
      payeeDid: status.payee!,
      asset: status.asset!,
      totalCollateral: status.collateral!,
      epoch: status.epoch!,
      status: status.status!,
    };

    return { exists: true, metadata };
  }

  /**
   * Get sub-channel state
   */
  getSubChannelState(keyId: string): SubChannelState | undefined {
    return this.stateCache.get(keyId);
  }

  /**
   * Set default key ID for operations
   */
  setDefaultKeyId(keyId: string): void {
    this.defaultKeyId = keyId;
  }

  /**
   * Convert SignerInterface to Rooch Signer
   */
  private async convertToRoochSigner(): Promise<DidAccountSigner> {
    return DidAccountSigner.create(this.signer, this.defaultKeyId);
  }
} 