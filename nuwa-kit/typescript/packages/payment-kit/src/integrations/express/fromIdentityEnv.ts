/**
 * IdentityEnv integration for ExpressPaymentKit
 */

import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import { 
  createExpressPaymentKit,
  type ExpressPaymentKitOptions,
  type ExpressPaymentKit,
} from './ExpressPaymentKit';

/**
 * Create ExpressPaymentKit using IdentityEnv's KeyManager and chain config
 * 
 * @param env IdentityEnv instance
 * @param opts ExpressPaymentKitOptions without signer, rpcUrl, and network (will be provided by env)
 * @returns Promise resolving to configured ExpressPaymentKit instance
 */
export async function createExpressPaymentKitFromEnv(
  env: IdentityEnv,
  opts: Omit<ExpressPaymentKitOptions, 'signer' | 'rpcUrl' | 'network'>
): Promise<ExpressPaymentKit> {
  const chainConfig = getChainConfigFromEnv(env);
  
  // Type assertion to ensure we have a rooch chain config
  if (chainConfig.chain !== 'rooch') {
    throw new Error(`Unsupported chain type: ${chainConfig.chain}. Only 'rooch' is currently supported.`);
  }
  
  return createExpressPaymentKit({
    ...opts,
    signer: env.keyManager,
    rpcUrl: chainConfig.rpcUrl,
    network: chainConfig.network,
  });
}