/**
 * MCP Server v2 - Start via FastMcpStarter (handles MCP over HTTP/SSE)
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { KeyManager } from '@nuwa-ai/identity-kit';
import { createFastMcpServer } from '@nuwa-ai/payment-kit';
import { initUpstream } from './upstream.js';
import type { Upstream } from './types.js';
import { z } from 'zod';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Minimal config for v2 (single service)
interface MinimalToolConfig {
  name: string;
  description: string;
  pricePicoUSD?: string | number; // kept for forward compatibility; ignored until payment integration
  parameters?: any;
}

interface MinimalConfig {
  port?: number;
  endpoint?: string; // default "/mcp"
  register?: {
    tools?: MinimalToolConfig[];
  };
  // Payment options (optional; when provided, payment is enabled)
  serviceId?: string;
  serviceKey?: string; // serialized StoredKey string (preferred to env)
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  defaultAssetId?: string;
  defaultPricePicoUSD?: string | bigint; // Default price for all tools (custom and upstream)
  adminDid?: string | string[];
  debug?: boolean;
  // Upstream MCP server (single), e.g., http://localhost:4000/mcp
  upstreamUrl?: string;
}

// Load minimal configuration
function loadConfig(): MinimalConfig {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.yaml');
  const configYaml = fs.readFileSync(configPath, 'utf8');

  const configWithEnvVars = configYaml.replace(/\${([^}]+)}/g, (_, varName) => {
    return process.env[varName] || '';
  });

  const cfg = yaml.load(configWithEnvVars) as any;
  const port = Number(process.env.PORT || cfg?.port || cfg?.server?.port || 8088);
  const endpoint = (cfg?.endpoint || '/mcp') as string;
  const tools: MinimalToolConfig[] = cfg?.register?.tools || [];
  const payment: Partial<MinimalConfig> = {
    serviceId: cfg?.serviceId || process.env.SERVICE_ID,
    serviceKey: cfg?.serviceKey || process.env.SERVICE_KEY,
    rpcUrl: cfg?.rpcUrl || process.env.ROOCH_RPC_URL,
    network: (cfg?.network || process.env.ROOCH_NETWORK || 'test') as any,
    defaultAssetId: cfg?.defaultAssetId || process.env.DEFAULT_ASSET_ID,
    defaultPricePicoUSD: cfg?.defaultPricePicoUSD || process.env.DEFAULT_PRICE_PICO_USD,
    adminDid: cfg?.adminDid,
    debug: cfg?.debug ?? (process.env.DEBUG === '1' || process.env.DEBUG === 'true'),
    upstreamUrl: cfg?.upstreamUrl || process.env.UPSTREAM_URL,
  };
  return { port, endpoint, register: { tools }, ...payment } as MinimalConfig;
}

// Local registry removed; FastMcpStarter manages tools

// No Fastify server; FastMcpStarter provides HTTP server

// (FastMcpStarter handles HTTP/SSE/MCP parsing)

// Main function
async function main() {
  try {
    const config = loadConfig();
    let signer: any = undefined;
    
    // Try to create signer from config or generate a test one
    if (config.serviceId) {
      if (config.serviceKey && config.serviceKey !== 'test-key-placeholder') {
        try {
          signer = await KeyManager.fromSerializedKey(config.serviceKey);
        } catch (error) {
          console.warn('Failed to load service key, generating test key:', error);
        }
      }
      
      // If no valid signer yet, generate a test one for development/testing
      if (!signer) {
        console.log('Generating test key for development...');
        const { keyManager } = await KeyManager.createWithDidKey();
        signer = keyManager;
      }
    }
    
    // Create server options, only include payment-related options if signer is available
    const serverOptions: any = {
      port: Number(config.port || process.env.PORT || 8088),
      endpoint: (config.endpoint || '/mcp') as any,
    };
    
    // Only add payment options if we have a signer
    if (signer) {
      serverOptions.serviceId = config.serviceId || 'nuwa-mcp-server';
      serverOptions.signer = signer;
      serverOptions.rpcUrl = config.rpcUrl || 'http://127.0.0.1:6767'; // Default test RPC
      serverOptions.network = (config.network as any) || 'test';
      serverOptions.defaultAssetId = config.defaultAssetId || '0x3::gas_coin::RGas';
      serverOptions.defaultPricePicoUSD = config.defaultPricePicoUSD as any;
      serverOptions.adminDid = config.adminDid as any;
      serverOptions.debug = config.debug;
    }
    
    const app: any = await createFastMcpServer(serverOptions);
    
    // Prepare upstream via shared helper if configured
    let upstream: Upstream | undefined;
    if (config.upstreamUrl) {
      upstream = await initUpstream('default', { type: 'httpStream', url: config.upstreamUrl });
    }
    
    // Register custom tools from config if any
    if (config.register?.tools && config.register.tools.length > 0) {
      for (const t of config.register.tools) {
        // Determine tool price: use tool-specific price, or fall back to default, or 0 if no payment config
        let toolPrice: bigint = 0n;
        if (t.pricePicoUSD !== undefined) {
          // Tool has explicit price configuration
          toolPrice = BigInt(t.pricePicoUSD);
        } else if (config.defaultPricePicoUSD !== undefined) {
          // Use default price from config
          toolPrice = BigInt(config.defaultPricePicoUSD);
        }
        // If neither tool price nor default price is set, tool is free (0n)
        
        const isFree = toolPrice === 0n;
        
        const execute = async (p: any, context?: any) => {
          console.log(`Executing custom tool ${t.name} with params:`, p, `(price: ${toolPrice} picoUSD)`);
          // Custom tools should be implemented based on their specific logic
          // For now, return a placeholder response
          return { message: `Custom tool ${t.name} executed with params`, params: p };
        };
        
        // Use the parameters from config or a permissive schema
        const parameters = t.parameters || z.object({}).passthrough();
        
        const def = { name: t.name, description: t.description, parameters, execute } as any;
        if (isFree) {
          (app as any).freeTool(def);
        } else {
          (app as any).paidTool({ ...def, pricePicoUSD: toolPrice });
        }
      }
    }

    // If upstream is configured, register a fallback handler for unknown tools
    if (upstream) {
      // Get upstream tools and register them as forwarding tools
      try {
        const upstreamTools = await upstream.client.listTools();
        if (upstreamTools && upstreamTools.tools) {
          for (const upstreamTool of upstreamTools.tools) {
            // Skip if we already have a custom tool with this name
            const customToolNames = (config.register?.tools || []).map(t => t.name);
            if (customToolNames.includes(upstreamTool.name)) {
              continue;
            }
            
            // Determine upstream tool price: use default price if configured
            let upstreamToolPrice: bigint = 0n;
            if (config.defaultPricePicoUSD !== undefined) {
              upstreamToolPrice = BigInt(config.defaultPricePicoUSD);
            }
            const isUpstreamToolFree = upstreamToolPrice === 0n;
            
            // Register upstream tool as forwarding tool (free or paid based on config)
            const forwardExecute = async (p: any, context?: any) => {
              console.log(`Forwarding tool ${upstreamTool.name} to upstream with params:`, p, `(price: ${upstreamToolPrice} picoUSD)`);
              const res = await upstream!.client.callTool({ name: upstreamTool.name, arguments: p || {} });
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
              if (typeof upstreamTool.inputSchema === 'object' && 'parse' in upstreamTool.inputSchema) {
                upstreamParameters = upstreamTool.inputSchema;
              } else {
                // For the mock echo tool, we know it needs a text parameter
                if (upstreamTool.name === 'echo') {
                  upstreamParameters = z.object({
                    text: z.string().describe('Text to echo')
                  });
                } else {
                  // Use permissive schema for other tools
                  upstreamParameters = z.object({}).passthrough();
                }
              }
            } else {
              upstreamParameters = z.object({}).passthrough();
            }
              
            const upstreamToolDef = {
              name: upstreamTool.name,
              description: upstreamTool.description || `Forwarded tool: ${upstreamTool.name}`,
              parameters: upstreamParameters,
              execute: forwardExecute
            };
            
            if (isUpstreamToolFree) {
              (app as any).freeTool(upstreamToolDef);
            } else {
              (app as any).paidTool({ ...upstreamToolDef, pricePicoUSD: upstreamToolPrice });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to register upstream tools:', error);
      }
    }
    const server = await app.start();
    const shutdown = async () => {
      try {
        await server.stop();
      } catch (e) {
        console.error('Error during server.stop():', e);
        process.exit(1);
      }
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    console.log(`MCP Server started on endpoint ${config.endpoint || '/mcp'}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);

// For testing/importing
export { loadConfig }; 