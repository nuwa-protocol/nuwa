import { AssetInfo, SignedSubRAV } from '../core/types';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

/**
 * Result type for blockchain transactions
 */
export interface TxResult {
  /** Transaction hash */
  txHash: string;
  /** Block height (optional) */
  blockHeight?: bigint;
  /** Transaction events (optional) */
  events?: unknown[];
}

/**
 * Parameters for opening a new payment channel
 */
export interface OpenChannelParams {
  payerDid: string;
  payeeDid: string;
  asset: AssetInfo;
  collateral: bigint;
  signer: SignerInterface;
}

/**
 * Result of opening a payment channel
 */
export interface OpenChannelResult {
  channelId: string;
  txHash: string;
  blockHeight?: bigint;
  events?: unknown[];
}

/**
 * Parameters for authorizing a sub-channel
 */
export interface AuthorizeSubChannelParams {
  channelId: string;
  vmIdFragment: string;
  publicKey: string;
  methodType: string;
  signer: SignerInterface;
}

/**
 * Parameters for claiming from a channel
 */
export interface ClaimParams {
  signedSubRAV: SignedSubRAV;
  signer: SignerInterface;
}

/**
 * Result of claiming from a channel
 */
export interface ClaimResult {
  txHash: string;
  claimedAmount: bigint;
  blockHeight?: bigint;
  events?: unknown[];
}

/**
 * Parameters for closing a channel
 */
export interface CloseParams {
  channelId: string;
  cooperative?: boolean;
  closeProofs?: unknown; // Channel-specific close proofs
  signer: SignerInterface;
}

/**
 * Parameters for querying channel status
 */
export interface ChannelStatusParams {
  channelId: string;
}

/**
 * Channel information and status
 */
export interface ChannelInfo {
  channelId: string;
  payerDid: string;
  payeeDid: string;
  asset: AssetInfo;
  totalCollateral: bigint;
  claimedAmount: bigint;
  epoch: bigint;
  status: 'active' | 'closing' | 'closed';
  authorizedSubChannels?: string[]; // List of authorized vmIdFragments
}

/**
 * Chain-agnostic payment channel contract interface
 * 
 * This interface abstracts payment channel operations across different blockchains,
 * providing a unified API for channel management, asset information, and pricing.
 */
export interface IPaymentChannelContract {
  // -------- Channel CRUD Operations --------
  
  /**
   * Open a new payment channel between payer and payee
   */
  openChannel(params: OpenChannelParams): Promise<OpenChannelResult>;

  /**
   * Authorize a sub-channel for multi-device support
   */
  authorizeSubChannel(params: AuthorizeSubChannelParams): Promise<TxResult>;

  /**
   * Claim accumulated amount from a channel using SubRAV
   */
  claimFromChannel(params: ClaimParams): Promise<ClaimResult>;

  /**
   * Close a payment channel (cooperative or forced)
   */
  closeChannel(params: CloseParams): Promise<TxResult>;

  /**
   * Get current channel status and metadata
   */
  getChannelStatus(params: ChannelStatusParams): Promise<ChannelInfo>;

  // -------- Asset Information & Pricing --------

  /**
   * Get asset metadata from on-chain sources
   * @param assetId Chain-specific asset identifier
   * @returns Asset information including symbol, decimals, etc.
   */
  getAssetInfo(assetId: string): Promise<AssetInfo>;

  /**
   * Get current asset price for off-chain billing
   * @param assetId Chain-specific asset identifier
   * @param quote Currency quote (default: USD)
   * @returns Price in pUSD (micro-USD, 1 USD = 1,000,000 pUSD)
   */
  getAssetPrice(assetId: string, quote?: 'USD' | 'CNY' | string): Promise<bigint>;
} 