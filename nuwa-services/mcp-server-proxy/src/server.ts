/**
 * MCP Server v2 - Start via FastMcpStarter (handles MCP over HTTP/SSE)
 */
import { KeyManager } from "@nuwa-ai/identity-kit";
import { createFastMcpServer } from "@nuwa-ai/payment-kit";
import { initUpstream } from "./upstream.js";
import type { Upstream } from "./types.js";
import {
  loadConfig,
  type MinimalConfig,
  type MinimalToolConfig,
} from "./config.js";
import { z } from "zod";

// Local registry removed; FastMcpStarter manages tools

// No Fastify server; FastMcpStarter provides HTTP server

// (FastMcpStarter handles HTTP/SSE/MCP parsing)

// Exported function to start the server (for testing and direct use)
async function startServer(
  configOverride?: Partial<MinimalConfig>,
): Promise<{ close: () => Promise<void> }> {
  const config = configOverride || loadConfig();
  let signer: any = undefined;

  // Try to create signer from config or generate a test one
  if (config.serviceId) {
    if (config.serviceKey && config.serviceKey !== "test-key-placeholder") {
      try {
        signer = await KeyManager.fromSerializedKey(config.serviceKey);
      } catch (error) {
        console.warn("Failed to load service key, generating test key:", error);
      }
    }

    // If no valid signer yet, generate a test one for development/testing
    if (!signer) {
      console.log("Generating test key for development...");
      const { keyManager } = await KeyManager.createWithDidKey();
      signer = keyManager;
    }
  }

  // Create server options, only include payment-related options if signer is available
  const serverOptions: any = {
    port: Number(config.port || process.env.PORT || 8088),
    endpoint: (config.endpoint || "/mcp") as any,
  };

  // Only add payment options if we have a signer
  if (signer) {
    serverOptions.serviceId = config.serviceId || "nuwa-mcp-server";
    serverOptions.signer = signer;
    serverOptions.rpcUrl = config.rpcUrl || "http://127.0.0.1:6767"; // Default test RPC
    serverOptions.network = (config.network as any) || "test";
    serverOptions.defaultAssetId =
      config.defaultAssetId || "0x3::gas_coin::RGas";
    serverOptions.defaultPricePicoUSD = config.defaultPricePicoUSD as any;
    serverOptions.adminDid = config.adminDid as any;
    serverOptions.debug = config.debug;
  }

  const app: any = await createFastMcpServer(serverOptions);

  // Prepare upstream via shared helper if configured
  let upstream: Upstream | undefined;
  if (config.upstreamUrl) {
    upstream = await initUpstream("default", {
      type: "httpStream",
      url: config.upstreamUrl,
    });
  }

  // Register tools from upstream if configured
  if (upstream) {
    try {
      const upstreamTools = await upstream.client.listTools();
      if (upstreamTools && upstreamTools.tools) {
        // Create a map of configured tool prices for quick lookup
        const configuredToolPrices = new Map<string, string>();
        if (config.register?.tools) {
          for (const configTool of config.register.tools) {
            configuredToolPrices.set(
              configTool.name,
              configTool.pricePicoUSD || "",
            );
          }
        }

        // Validate that all configured tools exist in upstream
        if (config.register?.tools) {
          const upstreamToolNames = new Set(
            upstreamTools.tools.map((t: any) => t.name),
          );
          for (const configTool of config.register.tools) {
            if (!upstreamToolNames.has(configTool.name)) {
              throw new Error(
                `Configured tool '${configTool.name}' not found in upstream server. Available tools: ${Array.from(upstreamToolNames).join(", ")}`,
              );
            }
          }
        }

        // Register all upstream tools with appropriate pricing
        for (const upstreamTool of upstreamTools.tools) {
          // Determine tool price: use configured price, or fall back to default, or 0 if no payment config
          let toolPrice: bigint = 0n;
          const configuredPrice = configuredToolPrices.get(upstreamTool.name);

          if (configuredPrice !== undefined) {
            // Tool has explicit price configuration
            toolPrice = BigInt(configuredPrice);
          } else if (config.defaultPricePicoUSD !== undefined) {
            // Use default price from config
            toolPrice = BigInt(config.defaultPricePicoUSD);
          }
          // If neither tool price nor default price is set, tool is free (0n)

          const isFree = toolPrice === 0n;

          // Register upstream tool as forwarding tool
          const forwardExecute = async (p: any, context?: any) => {
            console.log(
              `Forwarding tool ${upstreamTool.name} to upstream with params:`,
              p,
              `(price: ${toolPrice} picoUSD)`,
            );
            const res = await upstream!.client.callTool({
              name: upstreamTool.name,
              arguments: p || {},
            });
            console.log(`Upstream response for ${upstreamTool.name}:`, res);
            if (res && Array.isArray(res.content)) {
              // Return the content array directly so FastMcpStarter can handle it properly
              return { content: res.content };
            }
            return res;
          };

          // Convert upstream tool schema to zod if needed
          let upstreamParameters: any;
          if (upstreamTool.inputSchema) {
            // If it's already a zod schema, use it directly
            if (
              typeof upstreamTool.inputSchema === "object" &&
              "parse" in upstreamTool.inputSchema
            ) {
              upstreamParameters = upstreamTool.inputSchema;
            } else {
              // Use permissive schema for other tools - let the upstream server handle validation
              upstreamParameters = z.object({}).passthrough();
            }
          } else {
            upstreamParameters = z.object({}).passthrough();
          }

          const upstreamToolDef = {
            name: upstreamTool.name,
            description:
              upstreamTool.description ||
              `Forwarded tool: ${upstreamTool.name}`,
            parameters: upstreamParameters,
            execute: forwardExecute,
          };

          if (isFree) {
            (app as any).freeTool(upstreamToolDef);
          } else {
            (app as any).paidTool({
              ...upstreamToolDef,
              pricePicoUSD: toolPrice,
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to register upstream tools:", error);
      throw error; // Re-throw to prevent server from starting with invalid configuration
    }
  } else if (config.register?.tools && config.register.tools.length > 0) {
    // If tools are configured but no upstream is provided, this is an error
    throw new Error(
      "Tools are configured but no upstream server is provided. Tools can only be configured for upstream servers.",
    );
  }

  const server = await app.start();
  console.log(`MCP Server started on endpoint ${config.endpoint || "/mcp"}`);

  return {
    close: async () => {
      try {
        await server.stop();
        if (upstream) {
          await upstream.client.close();
        }
      } catch (e) {
        console.error("Error during server shutdown:", e);
      }
    },
  };
}

// Main function for direct execution
async function main() {
  try {
    const serverInstance = await startServer();

    const shutdown = async () => {
      try {
        await serverInstance.close();
      } catch (e) {
        console.error("Error during shutdown:", e);
        process.exit(1);
      }
      process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);

// For testing/importing
export { loadConfig, startServer };
