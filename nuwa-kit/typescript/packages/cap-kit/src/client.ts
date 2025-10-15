// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
// import { DIDAuth, type SignerInterface } from "@nuwa-ai/identity-kit";
import { IdentityEnv } from "@nuwa-ai/identity-kit";
import { createMcpClient, PaymentChannelMcpClient } from "@nuwa-ai/payment-kit";

export const buildClient = async (
	mcpUrl: string,
	env: IdentityEnv,
): Promise<PaymentChannelMcpClient> => {

  return createMcpClient({
    baseUrl: mcpUrl,
    env,
    maxAmount: BigInt(10_000_000),
    debug: false,
  })
};
