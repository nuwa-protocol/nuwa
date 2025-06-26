import { FastMCP } from "fastmcp";
import { z } from "zod";
import { DIDAuth, VDRRegistry, NIP1SignedObject, initRoochVDR} from "@nuwa-ai/identity-kit";

// -----------------------------------------------------------------------------
// Initialize VDRRegistry with default VDRs (rooch, key)
// -----------------------------------------------------------------------------
const registry = VDRRegistry.getInstance();
// Ensure rooch VDR is registered (idempotent)
initRoochVDR("test", undefined, registry);

// -----------------------------------------------------------------------------
// FastMCP server with DIDAuth (NIP-10) via authenticate option
// -----------------------------------------------------------------------------
const server = new FastMCP({
  name: "nuwa-mcp-demo",
  version: "0.1.0",

  /**
   * This function runs once per HTTP request (tool call, list tools, etc.).
   * Throwing a Response with status 401/403 rejects the call.
   */
  authenticate: async (request: any) => {
    try {
        const header =
          typeof request.headers?.get === "function"
            ? request.headers.get("authorization")
            : request.headers["authorization"] ?? request.headers["Authorization"];
        console.log("authenticate header", header);
        const prefix = "DIDAuthV1 ";
        if (!header || !header.startsWith(prefix)) {
        throw new Response(undefined, { status: 401, statusText: "Missing DIDAuthV1 header" });
        }

        const verify = await DIDAuth.v1.verifyAuthHeader(header, VDRRegistry.getInstance());
        if (!verify.ok) {
            const msg = (verify as { error: string }).error;
            console.error("authenticate error", msg);
            throw new Response(`Invalid DIDAuth: ${msg}`, { status: 403 });
        }
        const signerDid = verify.signedObject.signature.signer_did;
        console.log("authenticate signerDid", signerDid);
        return { did: signerDid };
    } catch (error) {
        console.error("authenticate error", error);
        throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
    }
  },
});

// -----------------------------------------------------------------------------
// Example tool – echo
// -----------------------------------------------------------------------------
server.addTool({
  name: "echo",
  description: "Echo back the provided text.",
  parameters: z.object({
    text: z.string().describe("Text to echo back"),
  }),
  async execute({ text }) {
    return text;
  },
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
server.start({
  transportType: "httpStream",
  httpStream: {
    port: 8080,
  },
});

console.log("✅ MCP server listening on http://localhost:8080/mcp (httpStream)"); 