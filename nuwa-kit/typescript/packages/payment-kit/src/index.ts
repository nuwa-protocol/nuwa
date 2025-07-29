import type { IdentityKit } from '@nuwa-ai/identity-kit';
import { VDRRegistry } from '@nuwa-ai/identity-kit';

// Core types and utilities
export * from './core/types';
export * from './core/SubRav';
export * from './core/ClaimScheduler';

// Payment processor architecture
export * from './core/PaymentProcessor';
export * from './core/PaymentUtils';
export * from './core/BillingContextBuilder';

// Payment codecs
// export * from './codecs/PaymentCodec';

// Contract interfaces
export * from './contracts/IPaymentChannelContract';

// Chain-agnostic clients
export * from './client/PaymentChannelPayerClient';
export * from './client/PaymentChannelPayeeClient';

// Factory for creating clients
export * from './factory/chainFactory';

// Modern storage layer - refactored architecture
export * from './storage';

// HTTP billing middleware (new refactored version)
export * from './middlewares/http/HttpBillingMiddleware';

// Rooch implementation
export * from './rooch/RoochPaymentChannelContract';

// Import after exports to avoid circular issue
import { PaymentChannelPayerClient } from './client/PaymentChannelPayerClient';
import { createRoochPaymentChannelClient as factoryCreateRoochClient } from './factory/chainFactory';

/**
 * Helper to create a PaymentChannelPayerClient for Rooch from an IdentityKit instance.
 * If `rpcUrl` is omitted, it will be inferred from the registered RoochVDR
 * that was configured during `IdentityKit.bootstrap()`.
 */
export async function createRoochPaymentChannelClient(opts: {
  kit: IdentityKit;
  keyId?: string;
  contractAddress?: string;
  debug?: boolean;
  rpcUrl?: string;
}): Promise<PaymentChannelPayerClient> {
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
} from './core/SubRav';

// HTTP Transport
export { HttpPaymentCodec } from './middlewares/http/HttpPaymentCodec';

// HTTP Billing middleware for deferred payment model (refactored)
export { HttpBillingMiddleware } from './middlewares/http/HttpBillingMiddleware';

// Billing system (excluding conflicting types)
export * from './billing';

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

export * from './integrations/express/BillableRouter';
export * from './integrations/express/ExpressPaymentKit';