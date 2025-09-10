/**
 * Core helper functions for IdentityEnv integration
 *
 * This module provides the shared utility function to extract chain configuration
 * from IdentityEnv instances. Specific integration functions are located in their
 * respective modules for better discoverability:
 *
 * - createHttpClientFromEnv: integrations/http/fromIdentityEnv
 * - createExpressPaymentKitFromEnv: transport/express/fromIdentityEnv
 */

import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { ChainConfig } from '../factory/chainFactory';

/**
 * Extract ChainConfig from IdentityEnv's registered VDRs
 *
 * @param env IdentityEnv instance with registered VDRs
 * @returns ChainConfig for payment channel operations
 * @throws Error if no supported VDR is found
 */
export function getChainConfigFromEnv(env: IdentityEnv): ChainConfig {
  const roochVdr = env.registry.getVDR('rooch');

  if (!roochVdr) {
    throw new Error(
      'RoochVDR not registered in IdentityEnv. Please ensure bootstrapIdentityEnv was called with method="rooch" or useVDR("rooch") was called.'
    );
  }

  // Access the options from RoochVDR instance
  // Note: This assumes RoochVDR has an 'options' property with the configuration
  const vdrOptions = (roochVdr as any).options || {};
  const rpcUrl = vdrOptions.rpcUrl || undefined;

  return {
    chain: 'rooch' as const,
    rpcUrl,
    network: vdrOptions.network || 'test',
    debug: vdrOptions.debug || false,
  };
}
