/**
 * Chain Factory for Payment Channel Contracts
 * 
 * Provides factory methods to create chain-specific contract implementations
 * and payment channel clients based on configuration.
 */

import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { IPaymentChannelContract } from '../contracts/IPaymentChannelContract';
import { PaymentChannelPayerClient, type PaymentChannelPayerClientOptions } from '../client/PaymentChannelPayerClient';
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
  storageOptions?: PaymentChannelPayerClientOptions['storageOptions'];
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
  static createClient(options: PaymentChannelFactoryOptions): PaymentChannelPayerClient {
    const contract = this.createContract(options.chainConfig);
    
    return new PaymentChannelPayerClient({
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
    storageOptions?: PaymentChannelPayerClientOptions['storageOptions'];
  }): PaymentChannelPayerClient {
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
export function createPaymentChannelClient(options: PaymentChannelFactoryOptions): PaymentChannelPayerClient {
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
}): PaymentChannelPayerClient {
  return PaymentChannelFactory.createRoochClient(options);
} 