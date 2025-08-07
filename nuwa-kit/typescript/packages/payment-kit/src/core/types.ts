/**
 * Core types for NIP-4 Payment Channel protocol
 */

// Re-export contract interface types for convenience
export type {
  TxResult,
  OpenChannelParams,
  OpenChannelResult,
  AuthorizeSubChannelParams,
  ClaimParams,
  ClaimResult,
  CloseParams,
  ChannelStatusParams,
} from '../contracts/IPaymentChannelContract';

/**
 * Sub-channel Receipt And Voucher - the core payment message in NIP-4
 */
export interface SubRAV {
  /** Protocol version (default: 1) */
  version: number;
  /** Blockchain identifier (e.g., 4 for Rooch testnet) */
  chainId: bigint;
  /** Deterministic channel identifier (32-byte hex string) */
  channelId: string;
  /** Channel epoch to prevent replay attacks across channel resets */
  channelEpoch: bigint;
  /** DID verification method fragment (e.g., 'key-1') */
  vmIdFragment: string;
  /** Total amount ever sent through this sub-channel */
  accumulatedAmount: bigint;
  /** Strictly increasing nonce per sub-channel */
  nonce: bigint;
}

/**
 * Signed SubRAV message
 */
export interface SignedSubRAV {
  subRav: SubRAV;
  signature: Uint8Array;
}

/**
 * Payment channel information from blockchain
 */
export interface ChannelInfo {
  channelId: string;
  payerDid: string;
  payeeDid: string;
  assetId: string;
  epoch: bigint;
  status: 'active' | 'closing' | 'closed';
  // Note: Sub-channel list should be obtained from DID Document or local storage
  // Use getSubChannel() method to query individual sub-channel dynamic states
  // Aggregated values like totalCollateral and claimedAmount should be calculated
  // separately by querying the payment hub and individual sub-channels as needed
}

/**
 * Sub-channel state tracking
 */
export interface SubChannelState {
  /** Associated channel ID */
  channelId: string;
  /** Channel epoch */
  epoch: bigint;
  /** Current accumulated amount for this sub-channel */
  accumulatedAmount: bigint;
  /** Current nonce for this sub-channel */
  nonce: bigint;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Transaction result from blockchain operations
 */
export interface TransactionResult {
  /** Transaction hash */
  txHash: string;
  /** Whether the transaction was successful */
  success: boolean;
  /** Block height if available */
  blockHeight?: number;
  /** Error message if failed */
  error?: string;
  /** Gas used */
  gasUsed?: bigint;
}

/**
 * HTTP Gateway Profile types
 */

/**
 * Payment header payload - protocol-agnostic structure for payment requests
 */
export interface PaymentHeaderPayload {
  /** Signed SubRAV from client */
  signedSubRav: SignedSubRAV;
  /** Per-request max amount (token smallest unit) */
  maxAmount: bigint;
  /** Optional client-side tx reference (idempotency) */
  clientTxRef?: string;
  /** Protocol version (default: 1) */
  version: number;
}

// Compatibility alias - maintain backward compatibility
export type HttpRequestPayload = PaymentHeaderPayload;

/**
 * HTTP response header payload
 */
export interface HttpResponsePayload {
  /** Service-proposed next SubRAV (unsigned, client will sign) */
  subRav: SubRAV;
  /** Amount debited for this transaction */
  amountDebited: bigint;
  /** Client transaction reference (echoed back from request) */
  clientTxRef?: string;
  /** Service transaction reference */
  serviceTxRef?: string;
  /** Error code (0 = success) */
  errorCode?: number;
  /** Human-readable message */
  message?: string;
} 

/**
 * Payment information for completed requests
 */
export interface PaymentInfo {
  /** Client transaction reference */
  clientTxRef: string;
  /** Service transaction reference (optional) */
  serviceTxRef?: string;
  /** Amount charged for this request (in asset's smallest/base units) */
  cost: bigint;
  /** Amount charged in picoUSD for display purposes */
  costUsd: bigint;
  /** Completed nonce value */
  nonce: bigint;
  /** Channel identifier */
  channelId: string;
  /** Asset identifier */
  assetId: string;
  /** Timestamp when payment was resolved (ISO8601) */
  timestamp: string;
}

/**
 * Result wrapper for HTTP requests with payment information
 */
export interface PaymentResult<T> {
  /** Response data */
  data: T;
  /** Payment information (undefined for free endpoints) */
  payment?: PaymentInfo;
}

/**
 * Asset information including on-chain metadata
 */
export interface AssetInfo {
  /** Asset identifier */
  assetId: string;
  /** Number of decimal places for this asset */
  decimals: number;
  /** Symbol for display (optional) */
  symbol?: string;
  /** Name for display (optional) */
  name?: string;
  /** External price feed identifier (e.g., coingecko id) */
  priceId?: string;
  /** Price multiplier for low-value assets */
  priceMultiplier?: number;
}
