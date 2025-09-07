import { z } from "zod";
import { VDRRegistry, initRoochVDR, KeyManager, MemoryKeyStore, KeyType } from "@nuwa-ai/identity-kit";
import { createFastMcpServerFromEnv } from "@nuwa-ai/payment-kit/mcp";

// -----------------------------------------------------------------------------
// Initialize VDRRegistry with default VDRs (rooch, key)
// -----------------------------------------------------------------------------
const registry = VDRRegistry.getInstance();
// Ensure rooch VDR is registered (idempotent)
initRoochVDR("test", undefined, registry);

// -----------------------------------------------------------------------------
// Create Payment-enabled FastMCP server with Nuwa built-ins
// -----------------------------------------------------------------------------
async function main() {
  // Prepare IdentityEnv-like setup: KeyManager + Rooch VDR
  const serviceDid = process.env.SERVICE_DID || "did:test:nuwa-mcp-service";
  const store = new MemoryKeyStore();
  const keyManager = new KeyManager({ store, did: serviceDid, defaultKeyType: KeyType.ED25519 });
  await keyManager.generateKey("account-key", KeyType.ED25519);

  const port = Number(process.env.PORT || 8080);
  const rpcUrl = process.env.ROOCH_NODE_URL || "http://localhost:6767";

  // Minimal env object for factory
  const env: any = {
    keyManager,
    registry,
  };
  (registry.getVDR("rooch") as any).options = { rpcUrl, network: "test", debug: true };

  const server = await createFastMcpServerFromEnv(env, {
    serviceId: "nuwa-mcp-demo",
    defaultAssetId: "0x3::gas_coin::RGas",
    adminDid: serviceDid,
    debug: true,
    port,
    endpoint: "/mcp",
    wellKnown: {
      enabled: true,
      discovery: async () => ({
        serviceId: "nuwa-mcp-demo",
        serviceDid,
        defaultAssetId: "0x3::gas_coin::RGas",
      }),
    },
  });

  // Register example free tools (no billing) and paid tools (with billing)
  server.freeTool({
    name: "echo",
    description: "Echo back the provided text.",
    parameters: z.object({ text: z.string().describe("Text to echo back") }),
    async execute({ text }) {
      return text;
    },
  });

  server.freeTool({
    name: "get_did",
    description: "Get the DID of the caller (from __nuwa_auth if provided).",
    parameters: z.object({}),
    async execute(_args: unknown, context: any) {
      const did = context?.didInfo?.did || "unknown";
      return { did };
    },
  });

  // Free prompt example (no billing)
  server.addPrompt?.({
    name: "shout",
    description: "Transform input text to uppercase and surround by >>> <<<.",
    arguments: [
      {
        name: "text",
        description: "Text to transform",
        required: true,
      },
    ],
    async load({ text }: { text: string }) {
      return `>>> ${text.toUpperCase()} <<<`;
    },
  } as any);

  // Free resources examples (no billing)
  server.addResource?.({
    uri: "info://version",
    name: "Server Version Info",
    mimeType: "text/plain",
    async load() {
      return { text: `FastMCP demo server with Nuwa payment` };
    },
  } as any);

  server.addResourceTemplate?.({
    uriTemplate: "greet://{name}",
    name: "Greeting message",
    mimeType: "text/plain",
    arguments: [
      {
        name: "name",
        description: "Name of the person to greet",
        required: true,
      },
    ],
    async load({ name }: { name: string }) {
      return { text: `Hello, ${name}! Welcome to FastMCP demo server.` };
    },
  } as any);

  await server.start();
  console.log(`✅ MCP server with Nuwa payment started on http://localhost:${port}/mcp`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
