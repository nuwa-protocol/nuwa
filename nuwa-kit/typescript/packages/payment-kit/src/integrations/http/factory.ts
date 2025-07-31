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
export async function createHttpClient(options: CreateHttpClientOptions): Promise<PaymentChannelHttpClient> {
  const chainConfig = getChainConfigFromEnv(options.env);
  
  const httpPayerOptions: HttpPayerOptions = {
    baseUrl: options.baseUrl,
    chainConfig,
    signer: options.env.keyManager,
    maxAmount: options.maxAmount || BigInt('500000000000'), // Default: 50 cents USD
    debug: options.debug ?? chainConfig.debug,
    onError: options.onError,
    fetchImpl: options.fetchImpl,
    mappingStore: options.mappingStore
  };

  const client = new PaymentChannelHttpClient(httpPayerOptions);
  
  // Automatically perform service discovery
  try {
    const serviceInfo = await client.discoverService();
    if (httpPayerOptions.debug) {
      console.log('[PaymentChannelHttpClient] Service discovery completed:', serviceInfo);
    }
  } catch (error) {
    if (httpPayerOptions.debug) {
      console.warn('[PaymentChannelHttpClient] Service discovery failed, will retry when needed:', error);
    }
    // Continue anyway - the client will attempt discovery again when needed
  }
  
  return client;
}

/**
 * Create PaymentChannelHttpClient with manual configuration (advanced users)
 * Most users should prefer createHttpClient() with IdentityEnv
 * 
 * @param options - Detailed configuration options
 * @returns Configured PaymentChannelHttpClient instance
 */
export function createHttpPayerClient(options: CreateHttpPayerClientOptions): PaymentChannelHttpClient {
  const httpPayerOptions: HttpPayerOptions = {
    baseUrl: options.baseUrl,
    chainConfig: {
      chain: 'rooch',
      rpcUrl: options.rpcUrl || 'http://localhost:6767',
      network: options.network || 'local'
    },
    signer: options.signer,
    keyId: options.keyId,
    payerDid: options.payerDid,
    maxAmount: options.maxAmount,
    debug: options.debug,
    onError: options.onError,
    fetchImpl: options.fetchImpl,
    mappingStore: options.mappingStore
  };

  return new PaymentChannelHttpClient(httpPayerOptions);
}

/**
 * Create PaymentChannelHttpClient with manual configuration and automatic service discovery
 * Most users should prefer createHttpClient() with IdentityEnv
 * 
 * @param options - Detailed configuration options
 * @returns Promise resolving to configured PaymentChannelHttpClient instance
 */
export async function createHttpPayerClientWithDiscovery(options: CreateHttpPayerClientOptions): Promise<PaymentChannelHttpClient> {
  const client = createHttpPayerClient(options);
  
  // Perform service discovery
  try {
    const serviceInfo = await client.discoverService();
    if (options.debug) {
      console.log('[PaymentChannelHttpClient] Service discovery completed:', serviceInfo);
    }
  } catch (error) {
    if (options.debug) {
      console.warn('[PaymentChannelHttpClient] Service discovery failed:', error);
    }
  }
  
  return client;
}

/**
 * Create multiple HTTP clients for different services with shared IdentityEnv (recommended)
 * 
 * @param env - Shared IdentityEnv instance
 * @param services - Array of service configurations
 * @returns Promise resolving to map of service name to PaymentChannelHttpClient
 * 
 * @example
 * ```typescript
 * const env = await bootstrapIdentityEnv({ method: 'rooch', vdrOptions: { ... } });
 * 
 * const clients = await createMultipleHttpClients(env, [
 *   { name: 'llm', baseUrl: 'https://api.llm-gateway.com', maxAmount: BigInt('500000000000') },
 *   { name: 'storage', baseUrl: 'https://api.storage.com', maxAmount: BigInt('100000000000') }
 * ]);
 * 
 * await clients.llm.post('/v1/chat', { message: 'hello' });
 * await clients.storage.post('/v1/upload', fileData);
 * ```
 */
export async function createMultipleHttpClients<T extends string>(
  env: IdentityEnv,
  services: Array<{
    name: T;
    baseUrl: string;
    maxAmount?: bigint;
    debug?: boolean;
  }>
): Promise<Record<T, PaymentChannelHttpClient>> {
  const clients = {} as Record<T, PaymentChannelHttpClient>;

  // Create all clients in parallel with service discovery
  await Promise.all(
    services.map(async (service) => {
      clients[service.name] = await createHttpClient({
        env,
        baseUrl: service.baseUrl,
        maxAmount: service.maxAmount,
        debug: service.debug
      });
    })
  );

  return clients;
}

/**
 * Create multiple HTTP payer clients for different services with manual configuration (advanced)
 * Most users should prefer createMultipleHttpClients() with IdentityEnv
 * 
 * @param baseOptions - Common configuration options
 * @param services - Array of service configurations
 * @returns Map of service name to PaymentChannelHttpClient
 */
export function createMultipleHttpPayerClients<T extends string>(
  baseOptions: Omit<CreateHttpPayerClientOptions, 'baseUrl'>,
  services: Array<{
    name: T;
    baseUrl: string;
    maxAmount?: bigint;
    debug?: boolean;
  }>
): Record<T, PaymentChannelHttpClient> {
  const clients = {} as Record<T, PaymentChannelHttpClient>;

  for (const service of services) {
    clients[service.name] = createHttpPayerClient({
      ...baseOptions,
      baseUrl: service.baseUrl,
      maxAmount: service.maxAmount ?? baseOptions.maxAmount,
      debug: service.debug ?? baseOptions.debug
    });
  }

  return clients;
}