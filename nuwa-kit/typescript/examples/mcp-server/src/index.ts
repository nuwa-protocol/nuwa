import { z } from "zod";
import { VDRRegistry, initRoochVDR, KeyManager, MemoryKeyStore, KeyType, IdentityKit } from "@nuwa-ai/identity-kit";
import { createFastMcpServerFromEnv } from "@nuwa-ai/payment-kit/mcp";
import dotenv from 'dotenv';

dotenv.config();

// -----------------------------------------------------------------------------
// Create Payment-enabled FastMCP server with Nuwa built-ins
// -----------------------------------------------------------------------------
async function main() {
  const serviceKey = process.env.SERVICE_KEY || "";
  if (!serviceKey) {
    throw new Error("SERVICE_KEY environment variable is required");
  }
  const keyManager = await KeyManager.fromSerializedKey(serviceKey);
  const serviceDid = await keyManager.getDid();

  const port = Number(process.env.PORT || 8080);

  const env = await IdentityKit.bootstrap({
    method: "rooch",
    keyStore: keyManager.getStore(),
    vdrOptions: {
      network: "test",
    },
  });
  const server = await createFastMcpServerFromEnv(env, {
    serviceId: "nuwa-mcp-demo",
    adminDid: serviceDid,
    debug: true,
    port,
    endpoint: "/mcp",
    wellKnown: {
      enabled: true,
    },
  });

  // Register example free tools (no billing) and paid tools (with billing)
  server.paidTool({
    name: "echo",
    description: "Echo back the provided text.",
    parameters: { text: z.string().describe("Text to echo back") },
    pricePicoUSD: BigInt(1000000000), // 0.001 USD
    async execute({ text }) {
      return text;
    },
  });

  server.freeTool({
    name: "get_did",
    description: "Get the DID of the caller (from __nuwa_auth if provided).",
    parameters: {},
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
  console.log(`✅ Service DID: ${serviceDid}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
