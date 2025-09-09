import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { McpPayerOptions } from '../../integrations/mcp/PaymentChannelMcpClient';
import { PaymentChannelMcpClient } from '../../integrations/mcp/PaymentChannelMcpClient';

/** Create PaymentChannelMcpClient from IdentityEnv. */
export async function createMcpClient(
  env: IdentityEnv,
  options: Omit<McpPayerOptions, 'signer' | 'chainConfig'> & { baseUrl: string }
) {
  const chainConfig = getChainConfigFromEnv(env);
  return new PaymentChannelMcpClient({
    ...options,
    chainConfig,
    signer: env.keyManager,
  });
}
