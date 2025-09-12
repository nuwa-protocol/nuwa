import type { SignerInterface, IdentityEnv } from '@nuwa-ai/identity-kit';
import type { McpPayerOptions } from './PaymentChannelMcpClient';
import { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { TransactionStore } from '../../storage';

/**
 * Simple options for creating PaymentChannelMcpClient with IdentityEnv (recommended)
 */
export interface CreateMcpClientOptions {
  /** MCP server endpoint, e.g., http://localhost:8080/mcp */
  baseUrl: string;

  /** Pre-configured IdentityEnv (contains VDR registry, KeyManager, and chain config) */
  env: IdentityEnv;

  /** Optional maximum amount per request (defaults to 50 cents USD) */
  maxAmount?: bigint;

  /** Optional debug mode (inherits from IdentityEnv if not specified) */
  debug?: boolean;

  /** Optional storage configuration. If not provided, uses in-memory storage */
  storageOptions?: {
    channelRepo?: any; // ChannelRepository interface
    /** Namespace for storage keys (useful for multi-service scenarios) */
    namespace?: string;
  };

  /** Optional transaction store for logging */
  transactionStore?: TransactionStore;

  /** Transaction logging configuration */
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

/**
 * Advanced options for creating PaymentChannelMcpClient with manual configuration
 * Most users should prefer CreateMcpClientOptions with IdentityEnv
 */
export interface CreateMcpPayerClientOptions {
  /** MCP server endpoint, e.g., http://localhost:8080/mcp */
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

  /** Optional storage configuration */
  storageOptions?: {
    channelRepo?: any;
    namespace?: string;
  };

  /** Optional transaction store */
  transactionStore?: TransactionStore;

  /** Optional transaction logging configuration */
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

/**
 * Create PaymentChannelMcpClient with IdentityEnv (recommended approach)
 * Automatically uses optimal defaults and chain configuration from IdentityEnv
 *
 * @param options - Simple configuration options with IdentityEnv
 * @returns Promise resolving to configured PaymentChannelMcpClient instance
 *
 * @example
 * ```typescript
 * import { bootstrapIdentityEnv, createMcpClient } from '@nuwa-ai/payment-kit';
 *
 * // 1. Set up identity environment (once per app)
 * const env = await bootstrapIdentityEnv({
 *   method: 'rooch',
 *   vdrOptions: { rpcUrl: 'https://testnet.rooch.network', network: 'test' }
 * });
 *
 * // 2. Create MCP client with automatic configuration
 * const client = await createMcpClient({
 *   baseUrl: 'http://localhost:8080/mcp',
 *   env,
 *   maxAmount: BigInt('500000000000'), // 50 cents USD
 * });
 *
 * // 3. Use it!
 * const result = await client.call('some_tool', { param: 'value' });
 * ```
 */
export async function createMcpClient(
  options: CreateMcpClientOptions
): Promise<PaymentChannelMcpClient> {
  const chainConfig = getChainConfigFromEnv(options.env);
  let keyId;
  const keyIds = await options.env.keyManager.listKeyIds?.();
  if (keyIds && keyIds.length > 0) {
    keyId = keyIds[0];
  } else {
    throw new Error('No keyId available');
  }
  const mcpPayerOptions: McpPayerOptions = {
    baseUrl: options.baseUrl,
    chainConfig,
    signer: options.env.keyManager,
    keyId,
    maxAmount: options.maxAmount || BigInt('500000000000'), // Default: 50 cents USD
    debug: options.debug ?? chainConfig.debug,
    storageOptions: options.storageOptions,
    transactionStore: options.transactionStore,
    transactionLog: options.transactionLog,
  };

  const client = new PaymentChannelMcpClient(mcpPayerOptions);

  return client;
}
