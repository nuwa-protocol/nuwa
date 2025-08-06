import type { ChainConfig } from '../../factory/chainFactory';
import type { PaymentChannelPayerClientOptions } from '../../client/PaymentChannelPayerClient';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { SubRAV } from '../../core/types';
import type { PersistedHttpClientState } from '../../schema/core';

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

  /** Storage options for payment channel data */
  storageOptions?: PaymentChannelPayerClientOptions['storageOptions'];

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

  /** Amount to deposit to hub when creating channels (defaults to 10 RGas) */
  hubFundAmount?: bigint;



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

  /** Custom fetch implementation (defaults to global fetch) */
  fetchImpl?: FetchLike;

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
  isHandshakeComplete: boolean;
}

/**
 * Payment request context
 */
export interface PaymentRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}