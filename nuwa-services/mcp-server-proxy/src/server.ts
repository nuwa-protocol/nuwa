/**
 * MCP Server Proxy - Main Server
 */
import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';

// Import modules
import { didAuthMiddleware } from './auth.js';
import { determineUpstream, setUpstreamInContext } from './router.js';
import { initUpstream, forwardToolList, forwardToolCall, forwardPromptLoad } from './upstream.js';
import { ProxyConfig, UpstreamRegistry } from './types.js';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load configuration
function loadConfig(): ProxyConfig {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.yaml');
  const configYaml = fs.readFileSync(configPath, 'utf8');
  
  // Replace environment variables in the config
  const configWithEnvVars = configYaml.replace(/\${([^}]+)}/g, (_, varName) => {
    return process.env[varName] || '';
  });
  
  return yaml.load(configWithEnvVars) as ProxyConfig;
}

// Initialize upstreams
async function initializeUpstreams(config: ProxyConfig): Promise<UpstreamRegistry> {
  const upstreams: UpstreamRegistry = {};
  
  for (const [name, upstreamConfig] of Object.entries(config.upstreams)) {
    try {
      upstreams[name] = await initUpstream(name, upstreamConfig);
    } catch (error) {
      console.error(`Failed to initialize upstream ${name}:`, error);
    }
  }
  
  return upstreams;
}

// Create the Fastify server
function createServer(config: ProxyConfig): { 
  server: FastifyInstance; 
} {
  const { level, prettyPrint, ...restLogger } = config.server.logger as any;
  const loggerOpts: any = { level, ...restLogger };

  if (prettyPrint) {
    loggerOpts.transport = {
      target: 'pino-pretty',
      options: { colorize: true },
    };
  }

  const server = fastify({
    logger: loggerOpts,
  });
  
  // Register CORS
  server.register(cors, config.server.cors);
  
  return { server } as any;
}

// Register routes
function registerRoutes(
  server: FastifyInstance,
  config: ProxyConfig,
  upstreams: UpstreamRegistry,
): void {
  // Middleware to initialize request context
  server.addHook('onRequest', (request, reply, done) => {
    request.ctx = {
      startTime: Date.now(),
      upstream: config.defaultUpstream,
    };
    done();
  });
  
  // DIDAuth middleware
  if (config.didAuth.required) {
    server.addHook('onRequest', didAuthMiddleware);
  }
  
  // Router middleware
  server.addHook('preHandler', (request, reply, done) => {
    const upstream = determineUpstream(request, config.routes, config.defaultUpstream);
    setUpstreamInContext(request, upstream);
    done();
  });
  
  // Health check route
  server.get('/health', async (request, reply) => {
    return { status: 'ok', upstreams: Object.keys(upstreams) };
  });
  
  // MCP tool.list route
  server.get('/mcp/tools', async (request, reply) => {
    const upstreamName = request.ctx.upstream;
    const upstream = upstreams[upstreamName];
    
    if (!upstream) {
      return reply.status(404).send({
        error: `Upstream "${upstreamName}" not found`,
      });
    }
    
    try {
      await forwardToolList(request, reply, upstream);
    } catch (error) {
      console.error('Error handling tool.list:', error);
      return reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  // MCP tool.call route
  server.post('/mcp/tool.call', async (request, reply) => {
    const upstreamName = request.ctx.upstream;
    const upstream = upstreams[upstreamName];
    
    if (!upstream) {
      return reply.status(404).send({
        error: `Upstream "${upstreamName}" not found`,
      });
    }
    
    try {
      await forwardToolCall(request, reply, upstream);
    } catch (error) {
      console.error('Error handling tool.call:', error);
      return reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  
  // MCP prompt.load route
  server.post('/mcp/prompt.load', async (request, reply) => {
    const upstreamName = request.ctx.upstream;
    const upstream = upstreams[upstreamName];
    
    if (!upstream) {
      return reply.status(404).send({
        error: `Upstream "${upstreamName}" not found`,
      });
    }
    
    try {
      await forwardPromptLoad(request, reply, upstream);
    } catch (error) {
      console.error('Error handling prompt.load:', error);
      return reply.status(500).send({
        error: 'Failed to forward request to upstream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
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

    const { method, params, id } = payload || {};

    // Notifications (id is undefined or null) should not return error; acknowledge silently
    if ((id === undefined || id === null) && method === 'notifications/initialized') {
      reply.code(204).send(); // No Content
      return;
    }

    const jsonRpcError = (code: number, message: string) => reply.code(404).send({
      jsonrpc: '2.0',
      error: { code, message },
      id: id ?? null,
    });

    // Map to existing REST-like routes by internal inject
    switch (method) {
      case 'tools/list': {
        const res = await server.inject({
          method: 'GET',
          url: '/mcp/tools',
          headers: request.headers as any,
        });
        reply.code(res.statusCode).send(res.payload);
        return;
      }
      case 'tools/call': {
        if (!params?.name) return jsonRpcError(-32602, 'Missing params.name');

        const res = await server.inject({
          method: 'POST',
          url: '/mcp/tool.call',
          payload: { name: params.name, arguments: params.arguments || {} },
          headers: request.headers as any,
        });

        // Payload may be streamed (SSE). If so, pipe directly.
        const ctype = (res.headers['content-type'] as unknown as string) || '';
        if (ctype.includes('text/event-stream')) {
          reply.raw.writeHead(res.statusCode, res.headers as any);
          reply.raw.write(res.rawPayload || res.payload);
          return;
        }

        // Otherwise send as JSON-RPC result
        reply.code(res.statusCode).send({
          jsonrpc: '2.0',
          result: JSON.parse(res.payload),
          id,
        });
        return;
      }
      case 'initialize': {
        // TODO: In future, forward initialize to upstream and merge capabilities.
        return reply.send({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05', // TODO: fetch from upstream or constant
            serverInfo: { name: 'nuwa-mcp-proxy', version: '0.1.0' },
            capabilities: {
              tools: { listChanged: true },
              prompts: { load: true },
              resources: { read: true },
            },
          },
          id,
        });
      }
      default:
        console.log('Method not found:', method);
        return jsonRpcError(-32601, 'Method not found: ' + method);
    }
  };
  server.post('/mcp', rpcHandler);
  server.post('/mcp/', rpcHandler);
}

// Main function
async function main() {
  try {
    // Load configuration
    const config = loadConfig();
    
    // Initialize upstreams
    const upstreams = await initializeUpstreams(config);
    
    // Create server
    const { server } = createServer(config);
    
    // Register routes
    registerRoutes(server, config, upstreams);
    
    // Start server
    await server.listen({
      host: config.server.host,
      port: config.server.port,
    });
    
    console.log(`MCP Server Proxy started on ${config.server.host}:${config.server.port}`);
    console.log(`Available upstreams: ${Object.keys(upstreams).join(', ')}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);

// For testing/importing
export { loadConfig, initializeUpstreams, createServer, registerRoutes }; 