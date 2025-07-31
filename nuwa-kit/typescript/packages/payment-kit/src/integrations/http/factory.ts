import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { HttpPayerOptions } from './types';
import { PaymentChannelHttpClient } from './PaymentChannelHttpClient';

/**
 * Factory function options for creating PaymentChannelHttpClient
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
 * Factory function to create PaymentChannelHttpClient with sensible defaults
 * 
 * @param options - Configuration options
 * @returns Configured PaymentChannelHttpClient instance
 * 
 * @example
 * ```typescript
 * import { createHttpPayerClient } from '@nuwa-kit/payment-kit';
 * 
 * const client = createHttpPayerClient({
 *   baseUrl: 'https://api.llm-gateway.com',
 *   signer: myKeyManager,
 *   maxAmount: BigInt('50000000'), // 0.05 RGas
 *   debug: true
 * });
 * 
 * const result = await client.get('/v1/echo?q=hello');
 * ```
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
 * Create multiple HTTP payer clients for different services with shared configuration
 * 
 * @param baseOptions - Common configuration options
 * @param services - Array of service configurations
 * @returns Map of service name to PaymentChannelHttpClient
 * 
 * @example
 * ```typescript
 * const clients = createMultipleHttpPayerClients(
 *   {
 *     signer: myKeyManager,
 *     debug: true
 *   },
 *   [
 *     { name: 'llm', baseUrl: 'https://api.llm-gateway.com', maxAmount: BigInt('100000000') },
 *     { name: 'storage', baseUrl: 'https://api.storage.com', maxAmount: BigInt('50000000') }
 *   ]
 * );
 * 
 * await clients.llm.post('/v1/chat', { message: 'hello' });
 * await clients.storage.post('/v1/upload', fileData);
 * ```
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