import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { DIDAuth, type SignerInterface } from "@nuwa-ai/identity-kit";


export const buildClient = async (
	mcpUrl: string,
	signer: SignerInterface,
): Promise<any> => {
	const keyId = (await signer.listKeyIds())[0];

	// Create authorization header
	const payload = {
		operation: "mcp-json-rpc",
		params: { body: {} },
	} as const;

	const signedObject = await DIDAuth.v1.createSignature(payload, signer, keyId);
	const authHeader = DIDAuth.v1.toAuthorizationHeader(signedObject);

	// Create MCP client
	const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
		requestInit: {
			headers: {
				Authorization: authHeader,
			},
		},
	} as any);

	return transport;
};
