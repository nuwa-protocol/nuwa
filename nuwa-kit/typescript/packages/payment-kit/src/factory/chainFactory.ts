/**
 * Chain Factory for Payment Channel Contracts
 * 
 * Provides factory methods to create chain-specific contract implementations
 * and payment channel clients based on configuration.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import { PaymentChannelClient, type PaymentChannelClientOptions } from '../client/PaymentChannelClient';
import { RoochPaymentChannelContract, type RoochContractOptions } from '../rooch/RoochPaymentChannelContract';

/**
 * Supported blockchain networks
 */
export type SupportedChain = 'rooch';

/**
 * Chain configuration for Rooch
 */
export interface RoochChainConfig {
  chain: 'rooch';
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  contractAddress?: string;
  debug?: boolean;
}

/**
 * Union type for all supported chain configurations
 */
export type ChainConfig = RoochChainConfig;

/**
 * Factory options for creating payment channel clients
 */
export interface PaymentChannelFactoryOptions {
  chainConfig: ChainConfig;
  signer: SignerInterface;
  keyId?: string;
  storageOptions?: PaymentChannelClientOptions['storageOptions'];
}

/**
 * Chain Factory for creating payment channel contracts and clients
 */
export class PaymentChannelFactory {
  /**
   * Create a chain-specific contract implementation
   */
  static createContract(config: ChainConfig): IPaymentChannelContract {
    switch (config.chain) {
      case 'rooch':
        return new RoochPaymentChannelContract({
          rpcUrl: config.rpcUrl,
          network: config.network,
          contractAddress: config.contractAddress,
          debug: config.debug,
        });
      
      default:
        throw new Error(`Unsupported chain: ${(config as any).chain}`);
    }
  }

  /**
   * Create a payment channel client with chain-specific contract
   */
  static createClient(options: PaymentChannelFactoryOptions): PaymentChannelClient {
    const contract = this.createContract(options.chainConfig);
    
    return new PaymentChannelClient({
      contract,
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: options.storageOptions,
    });
  }

  /**
   * Convenience method to create a Rooch payment channel client
   */
  static createRoochClient(options: {
    signer: SignerInterface;
    keyId?: string;
    rpcUrl?: string;
    network?: 'local' | 'dev' | 'test' | 'main';
    contractAddress?: string;
    debug?: boolean;
    storageOptions?: PaymentChannelClientOptions['storageOptions'];
  }): PaymentChannelClient {
    return this.createClient({
      chainConfig: {
        chain: 'rooch',
        rpcUrl: options.rpcUrl,
        network: options.network,
        contractAddress: options.contractAddress,
        debug: options.debug,
      },
      signer: options.signer,
      keyId: options.keyId,
      storageOptions: options.storageOptions,
    });
  }
}

/**
 * Convenience function to create a payment channel client
 */
export function createPaymentChannelClient(options: PaymentChannelFactoryOptions): PaymentChannelClient {
  return PaymentChannelFactory.createClient(options);
}

/**
 * Convenience function to create a Rooch payment channel client
 */
export function createRoochPaymentChannelClient(options: {
  signer: SignerInterface;
  keyId?: string;
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  contractAddress?: string;
  debug?: boolean;
}): PaymentChannelClient {
  return PaymentChannelFactory.createRoochClient(options);
} 