// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
// import { DIDAuth, type SignerInterface } from "@nuwa-ai/identity-kit";
import { IdentityEnv } from "@nuwa-ai/identity-kit";
import { createMcpClient, UniversalMcpClient } from "@nuwa-ai/payment-kit";

export const buildClient = async (
	mcpUrl: string,
	env: IdentityEnv,
): Promise<UniversalMcpClient> => {
  console.log('build mcp client')
  return createMcpClient({
    baseUrl: mcpUrl,
    env,
    maxAmount: BigInt(10_000_000),
    debug: false,
    forceMode: 'payment',
  })
};
