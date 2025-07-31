/**
 * IdentityEnv integration for PaymentChannelHttpClient
 */

import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import { PaymentChannelHttpClient } from './PaymentChannelHttpClient';
import type { HttpPayerOptions } from './types';

/**
 * Create PaymentChannelHttpClient using IdentityEnv's KeyManager and chain config
 * 
 * @param env IdentityEnv instance
 * @param opts HttpPayerOptions without signer and chainConfig (will be provided by env)
 * @returns Configured PaymentChannelHttpClient instance
 */
export function createHttpClientFromEnv(
  env: IdentityEnv,
  opts: Omit<HttpPayerOptions, 'signer' | 'chainConfig'> & {
    /** Target service base URL, e.g., https://api.example.com */
    baseUrl: string;
  }
): PaymentChannelHttpClient {
  return new PaymentChannelHttpClient({
    ...opts,
    signer: env.keyManager,
    chainConfig: getChainConfigFromEnv(env),
  });
}