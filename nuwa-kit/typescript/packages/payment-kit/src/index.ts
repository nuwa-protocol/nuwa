import type { IdentityKit } from '@nuwa-ai/identity-kit';
import { VDRRegistry } from '@nuwa-ai/identity-kit';

// Core types and utilities
export * from './core/types';
export * from './core/subrav';
export * from './core/http-header';

// Rooch implementation
export * from './rooch/contract';
export * from './rooch/client';

// Utilities
export * from './utils';

// Import after exports to avoid circular issue
import { RoochPaymentChannelClient } from './rooch/client';

/**
 * Helper to create a RoochPaymentChannelClient directly from an IdentityKit instance.
 * If `rpcUrl` is omitted, it will be inferred from the registered RoochVDR
 * that was configured during `IdentityKit.bootstrap()`.
 */
export async function createRoochPaymentChannelClient(opts: {
  kit: IdentityKit;
  keyId?: string;
  contractAddress?: string;
  debug?: boolean;
  rpcUrl?: string;
}): Promise<RoochPaymentChannelClient> {
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

  return new RoochPaymentChannelClient({
    rpcUrl,
    signer,
    keyId: opts.keyId,
    contractAddress: opts.contractAddress,
    debug: opts.debug,
  });
}

// Re-export important classes for convenience
export { RoochPaymentChannelClient } from './rooch/client';
export { 
  SubRAVSigner, 
  SubRAVCodec, 
  SubRAVUtils, 
  SubRAVValidator, 
  SubRAVSchema,
  CURRENT_SUBRAV_VERSION, 
  SUBRAV_VERSION_1 
} from './core/subrav';
export { HttpHeaderCodec } from './core/http-header';