import type { ChainConfig } from '../../factory/chainFactory';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type {
  SubRAV,
  PaymentInfo,
  SignedSubRAV,
  ChannelInfo,
  SubChannelState,
} from '../../core/types';
import type { PersistedHttpClientState } from '../../schema/core';
import type { ChannelRepository } from '../../storage';

/**
 * Configuration options for PaymentChannelHttpClient
 */
export interface HttpPayerOptions {
  /** Target service base URL, e.g., https://api.example.com */
  baseUrl: string;

  /** Chain configuration (blockchain settings) */
  chainConfig: ChainConfig;

  /** Signer for payment channel operations and DID authentication */
  signer: SignerInterface;

  /** Key ID for signing operations (optional, will use first available if not specified) */
  keyId?: string;

  /** Optional specific channelId. If empty, will auto-create or find active channel for current host */
  channelId?: string;

  /**
   * Optional DID for generating Authorization header.
   * If not provided, will be derived from signer.getDid()
   */
  payerDid?: string;

  /**
   * Optional payee DID for channel creation.
   * In production, this should be obtained from service discovery.
   * If not provided, will use payerDid as a fallback for testing.
   */
  payeeDid?: string;

  /** Default asset ID for channel operations (defaults to RGas) */
  defaultAssetId?: string;

  /** Default maximum amount to accept per request, refuse payment if exceeded */
  maxAmount?: bigint;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom error handler function */
  onError?: (err: unknown) => void;

  /**
   * Host to channelId mapping store, defaults to MemoryStore.
   * Browser runtime: recommended to use IndexedDB Store;
   * Node runtime: optional FileStore or RedisStore.
   */
  mappingStore?: HostChannelMappingStore;

  /** Channel repository for storing payment channel data */
  channelRepo?: ChannelRepository;

  /** Custom fetch implementation (defaults to global fetch) */
  fetchImpl?: FetchLike;

  /** Timeout for pending payment resolution in milliseconds (default: 30000ms) */
  timeoutMs?: number;

  /** Timeout used when the response is streaming (SSE/NDJSON). Defaults to 10 minutes. */
  timeoutMsStream?: number;

  /** Transaction logging */
  transactionStore?: import('../../storage').TransactionStore;
  transactionLog?: {
    enabled?: boolean;
    persist?: 'memory' | 'indexeddb' | 'custom';
    maxRecords?: number;
    sanitizeRequest?: (
      headers: Record<string, string>,
      body?: any
    ) => { headersSummary?: Record<string, string>; requestBodyHash?: string };
  };
}

// PersistedHttpClientState is now imported from schema/core to ensure
// consistency with Zod validation and avoid type duplication
// Re-export for convenience and backward compatibility
export type { PersistedHttpClientState };

/**
 * Host to client state mapping repository
 * Extended to support full client state persistence
 */
export interface HostChannelMappingStore {
  // Legacy methods for backward compatibility
  get(host: string): Promise<string | undefined>;
  set(host: string, channelId: string): Promise<void>;
  delete(host: string): Promise<void>;

  // New methods for full state management
  getState?(host: string): Promise<PersistedHttpClientState | undefined>;
  setState?(host: string, state: PersistedHttpClientState): Promise<void>;
  deleteState?(host: string): Promise<void>;
}

/**
 * Fetch-like interface for HTTP requests
 */
export interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Internal state for the HTTP client
 */
export interface HttpClientState {
  channelId?: string;
  pendingSubRAV?: SubRAV;
  /** Pending requests by clientTxRef for payment resolution */
  pendingPayments?: Map<string, PendingPaymentRequest>;
  /** Cached latest channel info (non-persistent) */
  channelInfo?: ChannelInfo;
  /** Cached latest sub-channel info (non-persistent) */
  subChannelInfo?: SubChannelState;
  /** Cached key id and vmId fragment for current signer */
  keyId?: string;
  vmIdFragment?: string;
}

/**
 * Pending payment request context
 */
export interface PendingPaymentRequest {
  /** Promise resolver for PaymentInfo */
  resolve: (paymentInfo: PaymentInfo | undefined) => void;
  /** Promise rejector */
  reject: (error: Error) => void;
  /** Request timestamp */
  timestamp: Date;
  /** Channel and asset info for PaymentInfo construction */
  channelId: string;
  assetId: string;
  /** Timeout ID for cleanup */
  timeoutId: NodeJS.Timeout;
  /** The SignedSubRAV that was sent with this pending request */
  sendedSubRav?: SignedSubRAV;
  /** The request context that was sent with this pending request */
  requestContext: PaymentRequestContext;
}

/**
 * Payment request context
 */
export interface PaymentRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  /** Correlation id for this request */
  clientTxRef?: string;
}

/**
 * A handle that exposes both the HTTP response promise and the correlated payment resolution promise.
 * Useful for advanced tracking/debugging without changing the existing high-level API.
 */
export interface PaymentRequestHandle<TResponse = Response> {
  /** Correlation id for this request */
  clientTxRef: string;
  /** The HTTP response promise (from fetchImpl) */
  response: Promise<TResponse>;
  /** The payment resolution promise (resolved when service replies with protocol header, or undefined on free endpoints) */
  payment: Promise<PaymentInfo | undefined>;
  /** A convenience promise that resolves when both response and payment are available */
  done: Promise<{ data: TResponse; payment: PaymentInfo | undefined }>;
  /** Attempt to abort the underlying HTTP request and reject the pending payment */
  abort?: () => void;
}
