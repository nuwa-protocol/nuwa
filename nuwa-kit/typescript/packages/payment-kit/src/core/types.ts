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
 * Asset information for payment channels
 */
export interface AssetInfo {
  /** Unique asset identifier on its origin chain (e.g., '0x3::gas_coin::RGas' or ObjectID) */
  assetId: string;
  /** Display symbol for UI purposes, optional */
  symbol?: string;
}

/**
 * Payment channel information from blockchain
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
 * HTTP request header payload
 */
export interface HttpRequestPayload {
  /** Target channel ID */
  channelId: string;
  /** Latest signed SubRAV from client */
  signedSubRav: SignedSubRAV;
  /** Maximum amount client willing to pay for this request */
  maxAmount?: bigint;
  /** Client transaction reference for idempotency */
  clientTxRef?: string;
  /** Client confirmation of previous service proposal */
  confirmationData?: {
    subRav: SubRAV;
    signatureConfirmer: Uint8Array;
  };
}

/**
 * HTTP response header payload
 */
export interface HttpResponsePayload {
  /** Service-proposed next SubRAV (unsigned, client will sign) */
  subRav: SubRAV;
  /** Amount debited for this transaction */
  amountDebited: bigint;
  /** Service transaction reference */
  serviceTxRef?: string;
  /** Error code (0 = success) */
  errorCode?: number;
  /** Human-readable message */
  message?: string;
} 