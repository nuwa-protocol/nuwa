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
 * Parameters for opening a new payment channel with sub-channel in one step
 */
export interface OpenChannelWithSubChannelParams {
  payerDid: string;
  payeeDid: string;
  asset: AssetInfo;
  collateral: bigint;
  vmIdFragment: string;
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
 * Parameters for querying sub-channel information
 */
export interface SubChannelParams {
  channelId: string;
  vmIdFragment: string;
}

/**
 * Sub-channel information and status
 */
export interface SubChannelInfo {
  vmIdFragment: string;
  publicKey: string;
  methodType: string;
  lastClaimedAmount: bigint;
  lastConfirmedNonce: bigint;
}

/**
 * Channel information and status
 */
export interface ChannelInfo {
  channelId: string;
  payerDid: string;
  payeeDid: string;
  asset: AssetInfo;
  epoch: bigint;
  status: 'active' | 'closing' | 'closed';
  // Note: Sub-channel list should be obtained from DID Document or local storage
  // Use getSubChannel() method to query individual sub-channel dynamic states
  // Aggregated values like totalCollateral and claimedAmount should be calculated
  // separately by querying the payment hub and individual sub-channels as needed
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
   * Open a new payment channel and authorize a sub-channel in one transaction
   * This is more efficient than calling openChannel() and authorizeSubChannel() separately
   */
  openChannelWithSubChannel(params: OpenChannelWithSubChannelParams): Promise<OpenChannelResult>;

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

  /**
   * Get individual sub-channel dynamic state information
   * Use this to query real-time status like lastClaimedAmount and lastConfirmedNonce
   */
  getSubChannel(params: SubChannelParams): Promise<SubChannelInfo>;

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
   * @returns Price in pUSD (pico-USD, 1 USD = 1,000,000,000,000 pUSD)
   */
  getAssetPrice(assetId: string): Promise<bigint>;

  /**
   * Get the chain ID from the blockchain
   * @returns Chain ID as bigint
   */
  getChainId(): Promise<bigint>;

  /**
   * Deposit funds to a payment hub for later use in payment channels
   * @param params Deposit parameters including target address, asset, amount, and signer
   * @returns Transaction result
   */
  depositToHub(params: DepositToHubParams): Promise<TxResult>;
}

export interface DepositToHubParams {
  /** Target DID to receive the deposit */
  targetDid: string;
  /** Asset information */
  asset: AssetInfo;
  /** Amount to deposit (in smallest asset units) */
  amount: bigint;
  /** Signer for the transaction */
  signer: SignerInterface;
} 