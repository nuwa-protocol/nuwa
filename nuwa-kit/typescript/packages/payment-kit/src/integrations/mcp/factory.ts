import type { SignerInterface, IdentityEnv } from '@nuwa-ai/identity-kit';
import type { McpPayerOptions } from './PaymentChannelMcpClient';
import { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
import { UniversalMcpClient } from './UniversalMcpClient';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { TransactionStore } from '../../storage';
import type { HostChannelMappingStore } from '../http/types';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Enhanced options for creating UniversalMcpClient with IdentityEnv (recommended)
 * Supports both payment-enabled and standard MCP servers with automatic detection
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

  /** Optional mapping store for state persistence. If not provided, uses default store */
  mappingStore?: HostChannelMappingStore;

  /** Optional custom transport (e.g., PostMessage for iframe communication) */
  customTransport?: Transport;

  // ===== Universal Client Options =====

  /**
   * Force specific client mode (default: 'auto' for automatic detection)
   * - 'auto': Automatically detect server type and use appropriate client
   * - 'payment': Force use of payment-enabled client (PaymentChannelMcpClient)
   * - 'standard': Force use of standard MCP client
   */
  forceMode?: 'auto' | 'payment' | 'standard';

  /**
   * Timeout for server detection in milliseconds (default: 5000)
   * Only used when forceMode is 'auto'
   */
  detectionTimeout?: number;
}

/**
 * Create UniversalMcpClient with IdentityEnv (recommended approach)
 * Automatically detects server type and uses appropriate client implementation
 * Fully backward compatible with existing PaymentChannelMcpClient API
 *
 * @param options - Enhanced configuration options with IdentityEnv
 * @returns Promise resolving to configured UniversalMcpClient instance
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
 * // 2. Create universal MCP client with automatic detection (recommended)
 * const client = await createMcpClient({
 *   baseUrl: 'http://localhost:8080/mcp',
 *   env,
 *   maxAmount: BigInt('500000000000'), // 50 cents USD
 * });
 *
 * // 3. Use it! (API is fully compatible with PaymentChannelMcpClient)
 * const result = await client.call('some_tool', { param: 'value' });
 *
 * // 4. Check what type of server was detected
 * console.log('Server type:', client.getServerType()); // 'payment' | 'standard'
 * console.log('Supports payment:', client.supportsPayment());
 * ```
 *
 * @example
 * ```typescript
 * // Force specific mode (skip auto-detection)
 * const paymentClient = await createMcpClient({
 *   baseUrl: 'http://payment-server:8080/mcp',
 *   env,
 *   forceMode: 'payment', // Skip detection, use payment client directly
 * });
 *
 * const standardClient = await createMcpClient({
 *   baseUrl: 'http://standard-server:8080/mcp',
 *   env,
 *   forceMode: 'standard', // Skip detection, use standard MCP client
 * });
 * ```
 */
export async function createMcpClient(
  options: CreateMcpClientOptions
): Promise<UniversalMcpClient> {
  const chainConfig = getChainConfigFromEnv(options.env);
  let keyId;
  const keyIds = await options.env.keyManager.listKeyIds?.();
  if (keyIds && keyIds.length > 0) {
    keyId = keyIds[0];
  } else {
    throw new Error('No keyId available');
  }

  const mcpPayerOptions: McpPayerOptions & {
    forceMode?: 'auto' | 'payment' | 'standard';
    detectionTimeout?: number;
  } = {
    baseUrl: options.baseUrl,
    chainConfig,
    signer: options.env.keyManager,
    keyId,
    maxAmount: options.maxAmount || BigInt('500000000000'), // Default: 50 cents USD
    debug: options.debug ?? chainConfig.debug,
    storageOptions: options.storageOptions,
    transactionStore: options.transactionStore,
    transactionLog: options.transactionLog,
    mappingStore: options.mappingStore,
    customTransport: options.customTransport,

    // Universal client options
    forceMode: options.forceMode || 'auto',
    detectionTimeout: options.detectionTimeout || 5000,
  };

  const client = new UniversalMcpClient(mcpPayerOptions);
  return client;
}

// ===== Backward Compatibility =====

/**
 * @deprecated Use createMcpClient instead. This function now returns UniversalMcpClient
 * for backward compatibility, but the API remains the same.
 *
 * Create PaymentChannelMcpClient with IdentityEnv (legacy function)
 * Now returns UniversalMcpClient but maintains full API compatibility
 */
export async function createPaymentMcpClient(
  options: CreateMcpClientOptions
): Promise<UniversalMcpClient> {
  // Force payment mode for legacy function
  return createMcpClient({
    ...options,
    forceMode: 'payment',
  });
}

/**
 * Create standard MCP client (new function)
 * Forces standard MCP mode without payment protocol
 */
export async function createStandardMcpClient(
  options: Omit<CreateMcpClientOptions, 'maxAmount' | 'chainConfig' | 'signer' | 'keyId'> & {
    /** Optional timeout for requests */
    timeout?: number;
  }
): Promise<UniversalMcpClient> {
  // Create minimal options for standard client
  // We still need env for potential future extensions
  return createMcpClient({
    ...options,
    forceMode: 'standard',
    maxAmount: BigInt(0), // Not used in standard mode
  });
}
