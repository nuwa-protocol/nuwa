import type { IdentityKit } from '@nuwa-ai/identity-kit';
import { VDRRegistry } from '@nuwa-ai/identity-kit';

// Core types and utilities
export * from './core/types';
export * from './core/subrav';
export * from './core/claim-scheduler';

// Contract interfaces
export * from './contracts/IPaymentChannelContract';

// Chain-agnostic client
export * from './client/PaymentChannelClient';

// Factory for creating clients
export * from './factory/chainFactory';

// Storage layer - unified storage abstractions
export type { 
  RAVStore, 
  ChannelStateStorage as BaseChannelStateStorage,
  ChannelStateCache 
} from './core/BaseStorage';
export { 
  MemoryRAVStore, 
  IndexedDBRAVStore,
  MemoryChannelStateCache 
} from './core/BaseStorage';

// Extended storage implementations with advanced features  
export type { 
  ChannelStateStorage, 
  CacheStats, 
  StorageOptions 
} from './core/ChannelStateStorage';
export { 
  MemoryChannelStateStorage, 
  IndexedDBChannelStateStorage,
  SQLChannelStateStorage
} from './core/ChannelStateStorage';

// Rooch implementation
export * from './rooch/RoochPaymentChannelContract';

// Import after exports to avoid circular issue
import { PaymentChannelClient } from './client/PaymentChannelClient';
import { createRoochPaymentChannelClient as factoryCreateRoochClient } from './factory/chainFactory';

/**
 * Helper to create a PaymentChannelClient for Rooch from an IdentityKit instance.
 * If `rpcUrl` is omitted, it will be inferred from the registered RoochVDR
 * that was configured during `IdentityKit.bootstrap()`.
 */
export async function createRoochPaymentChannelClient(opts: {
  kit: IdentityKit;
  keyId?: string;
  contractAddress?: string;
  debug?: boolean;
  rpcUrl?: string;
}): Promise<PaymentChannelClient> {
  const signer = opts.kit.getSigner();

  // Infer RPC URL from RoochVDR when not supplied
  let rpcUrl = opts.rpcUrl;
  if (!rpcUrl) {
    const vdr = VDRRegistry.getInstance().getVDR('rooch') as any;
    if (vdr && vdr.options && vdr.options.rpcUrl) {
      rpcUrl = vdr.options.rpcUrl as string;
    }
  }

  if (!rpcUrl) {
    throw new Error('rpcUrl not provided and could not be inferred from the IdentityKit environment');
  }

  // Use factory to create client
  return factoryCreateRoochClient({
    signer,
    keyId: opts.keyId,
    contractAddress: opts.contractAddress,
    debug: opts.debug,
    rpcUrl,
  });
}

// Core SubRAV utilities for advanced use cases
export { 
  SubRAVManager,
  SubRAVSigner, 
  SubRAVCodec, 
  SubRAVUtils, 
  SubRAVValidator, 
  SubRAVSchema,
  CURRENT_SUBRAV_VERSION, 
  SUBRAV_VERSION_1 
} from './core/subrav';

// HTTP Header codec for Gateway Profile implementation
export { HttpHeaderCodec } from './core/http-header';

// Utility functions
export { 
  generateNonce, 
  extractFragment, 
  isValidHex, 
  formatAmount,
  generateChannelId,
  bigintToString,
  stringToBigint,
  DebugLogger 
} from './utils';