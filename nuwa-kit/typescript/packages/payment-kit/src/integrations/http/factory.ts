import type { SignerInterface, IdentityEnv } from '@nuwa-ai/identity-kit';
import type { HttpPayerOptions } from './types';
import { PaymentChannelHttpClient } from './PaymentChannelHttpClient';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';

/**
 * Simple options for creating PaymentChannelHttpClient with IdentityEnv (recommended)
 */
export interface CreateHttpClientOptions {
  /** Target service base URL, e.g., https://api.example.com */
  baseUrl: string;

  /** Pre-configured IdentityEnv (contains VDR registry, KeyManager, and chain config) */
  env: IdentityEnv;

  /** Optional maximum amount per request (defaults to 50 cents USD) */
  maxAmount?: bigint;

  /** Optional debug mode (inherits from IdentityEnv if not specified) */
  debug?: boolean;

  /** Optional error handler */
  onError?: (err: unknown) => void;

  /** Optional custom fetch implementation */
  fetchImpl?: HttpPayerOptions['fetchImpl'];

  /** Optional mapping store */
  mappingStore?: HttpPayerOptions['mappingStore'];

  /** Optional channel repository */
  channelRepo?: HttpPayerOptions['channelRepo'];

  /** Timeout for pending payment resolution in milliseconds (non-streaming). */
  timeoutMs?: number;

  /** Per-frame idle timeout for streaming responses; defaults to timeoutMs if unspecified. */
  timeoutMsStream?: number;
}

/**
 * Advanced options for creating PaymentChannelHttpClient with manual configuration
 * Most users should prefer CreateHttpClientOptions with IdentityEnv
 */
export interface CreateHttpPayerClientOptions {
  /** Target service base URL, e.g., https://api.example.com */
  baseUrl: string;

  /** Signer for payment channel operations and DID authentication */
  signer: SignerInterface;

  /** Optional key ID (defaults to first available) */
  keyId?: string;

  /** Optional RPC URL (defaults to localhost) */
  rpcUrl?: string;

  /** Optional network (defaults to 'local') */
  network?: 'local' | 'dev' | 'test' | 'main';

  /** Optional DID (will be derived from signer if not provided) */
  payerDid?: string;

  /** Optional maximum amount per request */
  maxAmount?: bigint;

  /** Optional debug mode */
  debug?: boolean;

  /** Optional error handler */
  onError?: (err: unknown) => void;

  /** Optional custom fetch implementation */
  fetchImpl?: HttpPayerOptions['fetchImpl'];

  /** Optional mapping store */
  mappingStore?: HttpPayerOptions['mappingStore'];
}

/**
 * Create PaymentChannelHttpClient with IdentityEnv (recommended approach)
 * Automatically performs service discovery and uses optimal defaults
 *
 * @param options - Simple configuration options with IdentityEnv
 * @returns Promise resolving to configured PaymentChannelHttpClient instance
 *
 * @example
 * ```typescript
 * import { bootstrapIdentityEnv, createHttpClient } from '@nuwa-ai/payment-kit';
 *
 * // 1. Set up identity environment (once per app)
 * const env = await bootstrapIdentityEnv({
 *   method: 'rooch',
 *   vdrOptions: { rpcUrl: 'https://testnet.rooch.network', network: 'test' }
 * });
 *
 * // 2. Create HTTP client with automatic service discovery
 * const client = await createHttpClient({
 *   baseUrl: 'https://api.llm-gateway.com',
 *   env,
 *   maxAmount: BigInt('500000000000'), // 50 cents USD
 * });
 *
 * // 3. Use it!
 * const result = await client.get('/v1/echo?q=hello');
 * ```
 */
export async function createHttpClient(
  options: CreateHttpClientOptions
): Promise<PaymentChannelHttpClient> {
  const chainConfig = getChainConfigFromEnv(options.env);
  let keyId;
  const keyIds = await options.env.keyManager.listKeyIds?.();
  if (keyIds && keyIds.length > 0) {
    keyId = keyIds[0];
  } else {
    throw new Error('No keyId available');
  }
  const httpPayerOptions: HttpPayerOptions = {
    baseUrl: options.baseUrl,
    chainConfig,
    signer: options.env.keyManager,
    keyId,
    maxAmount: options.maxAmount || BigInt('500000000000'), // Default: 50 cents USD
    debug: options.debug ?? chainConfig.debug,
    onError: options.onError,
    fetchImpl: options.fetchImpl,
    mappingStore: options.mappingStore,
    channelRepo: options.channelRepo,
    timeoutMs: options.timeoutMs,
    timeoutMsStream: options.timeoutMsStream,
  };

  const client = new PaymentChannelHttpClient(httpPayerOptions);

  return client;
}
