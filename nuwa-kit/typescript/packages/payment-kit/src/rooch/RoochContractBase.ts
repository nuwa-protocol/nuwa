/**
 * Rooch Contract Base Class
 *
 * Base class for Rooch contract implementations that provides common functionality
 * such as client initialization, signer conversion, and transaction creation.
 */

import {
  RoochClient,
  Transaction,
  Signer,
  getRoochNodeUrl,
  type NetworkType,
} from '@roochnetwork/rooch-sdk';

import {
  DebugLogger,
  SignerInterface,
  DidAccountSigner,
  isSignerInterface,
} from '@nuwa-ai/identity-kit';

import { badRequest } from '../errors/RoochErrorMapper';

export interface RoochContractOptions {
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  contractAddress?: string;
  debug?: boolean;
}

/**
 * Base class for Rooch contract implementations
 *
 * Provides common functionality shared across different Rooch contract clients:
 * - RoochClient initialization
 * - Signer conversion utilities
 * - Transaction creation
 * - Network URL resolution
 * - Debug logging setup
 */
export abstract class RoochContractBase {
  protected client: RoochClient;
  protected contractAddress: string;
  protected logger: DebugLogger;

  constructor(options: RoochContractOptions, defaultContractAddress: string, loggerName: string) {
    const rpcUrl = options.rpcUrl || this.getDefaultRpcUrl(options.network || 'test');
    this.client = new RoochClient({ url: rpcUrl });
    this.contractAddress = options.contractAddress || defaultContractAddress;
    this.logger = DebugLogger.get(loggerName);

    if (options.debug) {
      this.logger.setLevel('debug');
    }

    this.logger.debug(`${loggerName} initialized with rpcUrl: ${rpcUrl}`);
  }

  /**
   * Create a new transaction instance
   */
  protected createTransaction(): Transaction {
    return new Transaction();
  }

  /**
   * Convert SignerInterface to Rooch Signer
   * Handles both SignerInterface and direct Signer instances
   */
  protected async convertSigner(signer: SignerInterface | Signer): Promise<Signer> {
    // If it implements SignerInterface, convert it to DidAccountSigner
    if (isSignerInterface(signer)) {
      if (signer instanceof DidAccountSigner) {
        // DidAccountSigner should have a method to get the underlying Rooch signer
        // For now, we'll cast it - this may need adjustment based on actual DidAccountSigner API
        return signer as any as Signer;
      }
      // Use DidAccountSigner.create for other SignerInterface implementations
      return DidAccountSigner.create(signer);
    }
    // Fallback: assume it's already a Signer
    return signer as Signer;
  }

  /**
   * Get default RPC URL for a given network
   * Maps our network names to Rooch SDK network names
   */
  protected getDefaultRpcUrl(network: 'local' | 'dev' | 'test' | 'main'): string {
    // Map our network names to Rooch SDK network names
    const networkMap: { [key: string]: string } = {
      local: 'localnet',
      dev: 'devnet',
      test: 'testnet',
      main: 'mainnet',
    };

    const roochNetwork = networkMap[network] || network;
    return getRoochNodeUrl(roochNetwork as NetworkType);
  }

  /**
   * Get the RoochClient instance
   */
  protected getClient(): RoochClient {
    return this.client;
  }

  /**
   * Get the contract address
   */
  protected getContractAddress(): string {
    return this.contractAddress;
  }

  /**
   * Get the logger instance
   */
  protected getLogger(): DebugLogger {
    return this.logger;
  }
}
