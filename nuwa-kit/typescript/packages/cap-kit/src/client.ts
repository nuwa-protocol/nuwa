// import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
// import { DIDAuth, type SignerInterface } from "@nuwa-ai/identity-kit";
import { IdentityEnv } from "@nuwa-ai/identity-kit";
import { createMcpClient, UniversalMcpClient } from "@nuwa-ai/payment-kit";
import { getRoochNodeUrl } from "@roochnetwork/rooch-sdk";

export const buildClient = async (
	mcpUrl: string,
	env: IdentityEnv,
): Promise<UniversalMcpClient> => {
  return createMcpClient({
    baseUrl: mcpUrl,
    // chainConfig: {
    //   chain: 'rooch',
    //   rpcUrl: getRoochNodeUrl('testnet'),
    //   network: 'test',
    // },
    env,
    maxAmount: BigInt(10_000_000),
    debug: false,
  })
};
