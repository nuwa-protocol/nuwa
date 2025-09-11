/**
 * MCP Server - Single embedded service (v2)
 * - Only exposes JSON-RPC over streamable HTTP at `/mcp`
 * - No REST compatibility routes
 * - No multi-upstream aggregation
 * - No session header DIDAuth; per-call auth/payment to be integrated later
 */
import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

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
  return { port, endpoint, register: { tools } };
}

// Simple in-memory tool registry (placeholders before payment integration)
type ToolExecute = (params: any, context?: any) => Promise<any> | any;
interface RegisteredTool {
  name: string;
  description: string;
  parameters?: any;
  execute: ToolExecute;
}

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(def: { name: string; description: string; parameters?: any; execute: ToolExecute }) {
    this.tools.set(def.name, { ...def });
  }

  list(): Array<{ name: string; description: string; inputSchema?: any }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters || { type: 'object', properties: {} },
    }));
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }
}

// Create the Fastify server
function createServer(): { server: FastifyInstance } {
  const server = fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
  });
  server.register(cors);
  return { server } as any;
}

// Register routes
function registerRoutes(
  server: FastifyInstance,
  config: MinimalConfig,
  registry: ToolRegistry,
): void {
  // Initialize request context
  server.addHook('onRequest', (request, reply, done) => {
    request.ctx = {
      startTime: performance.now(),
      upstream: 'embedded',
      timings: {},
    } as any;
    done();
  });

  // Health check
  server.get('/health', async (request, reply) => {
    return { status: 'ok', mode: 'embedded', tools: registry.list().map(t => t.name) };
  });

  /***************************************************************************
   * JSON-RPC root endpoint compatibility (`/mcp`)
   * Allows clients that follow the original MCP JSON-RPC convention
   * to use methods like "tools/list" and "tools/call" via POST /mcp.
   * For GET /mcp with Accept: text/event-stream, we return a keep-alive
   * SSE connection so that clients can establish a long poll even if the
   * upstream (especially stdio) does not push events.
   ***************************************************************************/

  const sseHandler = async (request: any, reply: any) => {
    // Start minimal SSE stream
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Initial comment to establish stream
    reply.raw.write(':' + Array(2049).join(' ') + "\n"); // 2KB padding for some browsers
    reply.raw.write(': keep-alive\n\n');

    const timer = setInterval(() => {
      try {
        reply.raw.write(': keep-alive\n\n');
      } catch {
        clearInterval(timer);
      }
    }, 30_000);

    request.raw.on('close', () => clearInterval(timer));
  };
  server.get('/mcp', sseHandler);
  server.get('/mcp/', sseHandler);

  const rpcHandler = async (request: any, reply: any) => {
    let payload: any;
    try {
      payload = request.body;
      if (typeof payload === 'string') payload = JSON.parse(payload);
    } catch {
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      });
    }

    // Record JSON-RPC method to ctx
    if (request.ctx) {
      request.ctx.rpcMethod = payload?.method ?? null;
    }

    const { method, params, id } = payload || {};
    const caps = {
      tools: {},
      prompts: {},
      resources: {},
      resourceTemplates: {},
    } as any;

    // Silently acknowledge 'notifications/initialized' notification
    if ((id === undefined || id === null) && method === 'notifications/initialized') {
      reply.code(204).send();
      return;
    }

    // Helper to check if a method is supported by the upstream's capabilities
    function isSupported(method: string) {
      if (method.startsWith('tools/')) {
        if (caps.tools === undefined) return true;
        return Boolean(caps.tools);
      }
      if (method.startsWith('prompts/')) {
        if (caps.prompts === undefined) return true;
        return Boolean(caps.prompts);
      }
      if (method.startsWith('resources/')) {
        if (caps.resources === undefined) return true;
        return Boolean(caps.resources);
      }
      if (method.startsWith('resourceTemplates/')) {
        if (caps.resourceTemplates === undefined) return true;
        return Boolean(caps.resourceTemplates);
      }
      return true;
    }

    const jsonRpcError = (code: number, message: string) => reply.code(404).send({
      jsonrpc: '2.0',
      error: { code, message },
      id: id ?? null,
    });

    switch (method) {
      case 'tools/list': {
        const tools = registry.list().map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema || t.parameters || { type: 'object', properties: {} },
        }));
        return reply.send({ jsonrpc: '2.0', id, result: { tools } });
      }
      case 'tools/call': {
        if (!params?.name) return jsonRpcError(-32602, 'Missing params.name');
        const tool = registry.get(params.name);
        if (!tool) return jsonRpcError(-32601, `Tool not found: ${params.name}`);
        try {
          const data = await tool.execute(params.arguments || {}, { request });
          let content: Array<{ type: string; text?: string }> = [];
          if (typeof data === 'string') {
            content = [{ type: 'text', text: data }];
          } else if (data && typeof data === 'object' && typeof (data as any).text === 'string') {
            content = [{ type: 'text', text: (data as any).text }];
          } else {
            content = [{ type: 'text', text: JSON.stringify(data) }];
          }
          return reply.send({ jsonrpc: '2.0', id, result: { content } });
        } catch (error: any) {
          return reply.code(500).send({ jsonrpc: '2.0', id, error: { code: -32000, message: String(error?.message || error) } });
        }
      }
      case 'prompts/list': {
        return reply.send({ jsonrpc: '2.0', id, result: [] });
      }
      case 'prompts/get': {
        return jsonRpcError(-32601, 'Method not supported');
      }
      case 'resources/list': {
        return reply.send({ jsonrpc: '2.0', id, result: [] });
      }
      case 'resources/read': {
        return jsonRpcError(-32601, 'Method not supported');
      }
      case 'resourceTemplates/list': {
        return reply.send({ jsonrpc: '2.0', id, result: [] });
      }
      case 'initialize': {
        return reply.send({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'nuwa-mcp-server', version: '0.2.0' },
            capabilities: caps,
          },
          id,
        });
      }
      default:
        console.log('Method not found:', method);
        return jsonRpcError(-32601, 'Method not found: ' + method);
    }
  };
  // Bind JSON-RPC handler to configured endpoint
  const ep = (config.endpoint || '/mcp').replace(/\/$/, '');
  server.post(ep, rpcHandler);
  server.post(ep + '/', rpcHandler);

  // --- logging ---
  server.addHook('onResponse', (request, reply, done) => {
    // Safely handle cases where request.ctx might be undefined
    if (!request.ctx) {
      request.log.warn({
        reqId: request.id,
        method: request.method,
        url: request.url,
        status: reply.statusCode,
      }, 'request.summary.no_ctx');
      done();
      return;
    }
    
    const total = Number((performance.now() - request.ctx.startTime).toFixed(3));
    const summary = {
      reqId: request.id,
      did: request.ctx.callerDid ?? null,
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      upstream: request.ctx.upstream,
      rpcMethod: request.ctx.rpcMethod ?? null,
      timings: { ...request.ctx.timings, total },
    };
    request.log.info(summary, 'request.summary');
    done();
  });

  server.addHook('onError', (request, reply, error, done) => {
    request.log.error({
      reqId: request.id,
      did: request.ctx?.callerDid ?? null,
      stage: 'error',
      upstream: request.ctx?.upstream,
      rpcMethod: request.ctx?.rpcMethod ?? null,
      err: error,
    }, 'request.error');
    done();
  });
}

// Main function
async function main() {
  try {
    const config = loadConfig();

    // Create server
    const { server } = createServer();

    // Build registry and register minimal tools
    const registry = new ToolRegistry();
    // Built-in sample tools; also honor config.register.tools for known names
    const addKnownTool = (t: MinimalToolConfig) => {
      if (t.name === 'calc.add') {
        registry.register({
          name: t.name,
          description: t.description || 'Add two numbers',
          parameters: t.parameters || { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
          execute: async (p: any) => {
            const a = Number(p?.a ?? 0);
            const b = Number(p?.b ?? 0);
            return { sum: a + b };
          },
        });
        return;
      }
      if (t.name === 'echo.free') {
        registry.register({
          name: t.name,
          description: t.description || 'Echo text',
          parameters: t.parameters || { type: 'object', properties: { text: { type: 'string' } } },
          execute: async (p: any) => ({ text: String(p?.text ?? '') }),
        });
        return;
      }
    };
    (config.register?.tools || []).forEach(addKnownTool);

    // Always provide built-ins if not configured
    if (!registry.get('calc.add')) addKnownTool({ name: 'calc.add', description: 'Add two integers' });
    if (!registry.get('echo.free')) addKnownTool({ name: 'echo.free', description: 'Free echo' });

    // Register routes
    registerRoutes(server, config, registry);

    // Graceful shutdown
    const shutdown = async () => {
      try {
        await server.close();
      } catch (e) {
        console.error('Error during server.close():', e);
        process.exit(1);
      }
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    const port = Number(config.port || process.env.PORT || 8088);
    await server.listen({
      host: '0.0.0.0',
      port,
    });

    console.log(`MCP Server started on 0.0.0.0:${port} endpoint ${config.endpoint || '/mcp'}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);

// For testing/importing
export { loadConfig, createServer, registerRoutes, ToolRegistry }; 