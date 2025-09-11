/**
 * MCP Server v2 - Start via FastMcpStarter (handles MCP over HTTP/SSE)
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { KeyManager } from '@nuwa-ai/identity-kit';
import { createFastMcpServer } from '@nuwa-ai/payment-kit';

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
  defaultPricePicoUSD?: string | bigint;
  adminDid?: string | string[];
  debug?: boolean;
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
    const signer = (config.serviceId && (config.serviceKey || process.env.SERVICE_KEY))
      ? await KeyManager.fromSerializedKey(config.serviceKey || process.env.SERVICE_KEY!)
      : undefined;
    const app: any = await createFastMcpServer({
      serviceId: config.serviceId || 'nuwa-mcp-server',
      signer: signer as any,
      rpcUrl: config.rpcUrl,
      network: (config.network as any) || 'test',
      defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
      defaultPricePicoUSD: config.defaultPricePicoUSD as any,
      adminDid: config.adminDid as any,
      debug: config.debug,
      port: Number(config.port || process.env.PORT || 8088),
      endpoint: (config.endpoint || '/mcp') as any,
    } as any);
    // Register minimal tools before start using FastMcp API (no register callback)
    const list = (config.register?.tools && config.register.tools.length > 0)
      ? config.register.tools
      : [
        { name: 'echo.free', description: 'Echo text', pricePicoUSD: '0', parameters: { type: 'object', properties: { text: { type: 'string' } } } },
        { name: 'calc.add', description: 'Add two integers', pricePicoUSD: '0', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
      ];
    for (const t of list as any[]) {
      const isFree = !t.pricePicoUSD || BigInt(t.pricePicoUSD) === 0n;
      const execute = async (p: any) => {
        if (t.name === 'echo.free') return { text: String(p?.text ?? '') };
        if (t.name === 'calc.add') return { sum: Number(p?.a ?? 0) + Number(p?.b ?? 0) };
        return { ok: true };
      };
      const def = { name: t.name, description: t.description, parameters: t.parameters, execute } as any;
      if (isFree) (app as any).freeTool(def);
      else (app as any).paidTool({ ...def, pricePicoUSD: BigInt(t.pricePicoUSD) });
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