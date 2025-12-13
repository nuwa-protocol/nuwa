// Optional convenience starter for FastMCP
// Users can import this to quickly start an MCP server with billing enabled.

import { McpPaymentKit, createMcpPaymentKit, McpPaymentKitOptions } from './McpPaymentKit';
import { z } from 'zod';
import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { Server } from 'http';
import { FastMCP, FastMCPSession } from 'fastmcp';
import { startHTTPServer } from 'mcp-proxy';
import { extendZodWithNuwaReserved, normalizeToZodObject } from './ToolSchema';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { RouteOptions } from '../express';

// Server type with explicit stop method used by tests and callers
export type StoppableServer = Server & { stop: () => Promise<void> };

export interface FastMcpServerOptions extends McpPaymentKitOptions {
  port?: number;
  endpoint?: `/${string}`;
  register?: (registrar: PaymentMcpToolRegistrar) => void;
  wellKnown?: {
    enabled?: boolean;
    path?: `/${string}`; // default: '/.well-known/nuwa-payment/info'
  };
  customRouteHandler?: (req: any, res: any) => Promise<boolean> | boolean;
}

/**
 * Convenience: start FastMCP server using IdentityEnv (env.keyManager + VDR chain config)
 */
export async function createFastMcpServerFromEnv(
  env: IdentityEnv,
  opts: Omit<FastMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>
) {
  const chain = getChainConfigFromEnv(env);
  return createFastMcpServer({
    ...opts,
    signer: env.keyManager,
    rpcUrl: chain.rpcUrl,
    network: chain.network,
    debug: opts.debug ?? chain.debug,
  });
}

export class PaymentMcpToolRegistrar {
  private started = false;
  registeredTools: any[] = [];
  registeredPrompts: any[] = [];
  registeredResources: any[] = [];
  registeredResourceTemplates: any[] = [];
  constructor(
    private readonly server: FastMCP,
    private readonly kit: McpPaymentKit
  ) {}

  markStarted(): void {
    this.started = true;
  }

  private ensureNotStarted(): void {
    if (this.started) {
      throw new Error(
        'MCP server already started; tool registration is closed. Register tools before start().'
      );
    }
  }

  addTool(args: {
    name: string;
    description: string;
    handler: (params: any, context?: any) => Promise<any>;
    schema?: any;
    options?: RouteOptions;
  }): void {
    this.ensureNotStarted();
    const { name, description, handler, schema, options } = args;
    // Register with billing (enables pricing/settlement)
    this.kit.register(name, options || { pricing: 0n }, handler);
    // Register with FastMCP (expose tool) via unified kit.invoke
    const kitRef = this.kit;
    const paramsSchema = (() => {
      if (!schema) return undefined;
      const zodObj = normalizeToZodObject(schema);
      if (zodObj) return extendZodWithNuwaReserved(zodObj);
      return undefined;
    })();
    const toolDef = {
      name,
      description,
      parameters: paramsSchema,
      async execute(params: any, context: any) {
        return await kitRef.invoke(name, params, context);
      },
    } as any;
    this.server.addTool(toolDef);
    this.registeredTools.push(toolDef);
  }

  freeTool(args: {
    name: string;
    description: string;
    handler: (params: any, context?: any) => Promise<any>;
    schema?: any;
  }): void {
    this.addTool({ ...args, options: { pricing: 0n } });
  }

  paidTool(args: {
    name: string;
    description: string;
    pricePicoUSD: bigint;
    handler: (params: any, context?: any) => Promise<any>;
    schema?: any;
  }): void {
    this.addTool({ ...args, options: { pricing: args.pricePicoUSD } });
  }

  getTools(): any[] {
    return this.registeredTools.slice();
  }

  addPrompt(def: {
    name: string;
    description: string;
    arguments?: any[];
    load: (args: any) => Promise<string> | string;
  }): void {
    this.ensureNotStarted();
    const promptDef = {
      name: def.name,
      description: def.description,
      arguments: def.arguments || [],
      async load(args: any) {
        return await def.load(args);
      },
    } as any;
    this.server.addPrompt(promptDef);
    this.registeredPrompts.push(promptDef);
  }

  addResource(def: {
    uri: string;
    name: string;
    mimeType: string;
    load: () => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }): void {
    this.ensureNotStarted();
    const resDef = {
      uri: def.uri,
      name: def.name,
      mimeType: def.mimeType,
      async load() {
        return await def.load();
      },
    } as any;
    this.server.addResource(resDef);
    this.registeredResources.push(resDef);
  }

  addResourceTemplate(def: {
    uriTemplate: string;
    name: string;
    mimeType: string;
    arguments?: any[];
    load: (args: any) => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }): void {
    this.ensureNotStarted();
    const tplDef = {
      uriTemplate: def.uriTemplate,
      name: def.name,
      mimeType: def.mimeType,
      arguments: def.arguments || [],
      async load(args: any) {
        return await def.load(args);
      },
    } as any;
    this.server.addResourceTemplate(tplDef);
    this.registeredResourceTemplates.push(tplDef);
  }

  getPrompts(): any[] {
    return this.registeredPrompts.slice();
  }
  getResources(): any[] {
    return this.registeredResources.slice();
  }
  getResourceTemplates(): any[] {
    return this.registeredResourceTemplates.slice();
  }
}

export async function createFastMcpServer(opts: FastMcpServerOptions): Promise<{
  addTool: (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
    options?: RouteOptions;
  }) => void;
  freeTool: (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => void;
  paidTool: (def: {
    name: string;
    description: string;
    pricePicoUSD: bigint;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => void;
  addPrompt: (def: {
    name: string;
    description: string;
    arguments?: any[];
    load: (args: any) => Promise<string> | string;
  }) => void;
  addResource: (def: {
    uri: string;
    name: string;
    mimeType: string;
    load: () => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }) => void;
  addResourceTemplate: (def: {
    uriTemplate: string;
    name: string;
    mimeType: string;
    arguments?: any[];
    load: (args: any) => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }) => void;
  start: () => Promise<StoppableServer>;
  getInner: () => { server: FastMCP; kit: McpPaymentKit };
}> {
  const logger = DebugLogger.get('FastMcpStarter');
  const server = new FastMCP({
    name: opts.serviceId || 'nuwa-mcp-server',
    version: '1.0.0',
  });
  const kit = await createMcpPaymentKit(opts);

  // Register built-in payment tools (FREE) via registrar to ensure new sessions include them
  const bootstrapRegistrar = new PaymentMcpToolRegistrar(server, kit);
  // Register each tool from kit, but the handler will delegate to kit.invoke
  // This ensures tools are available to FastMCP sessions
  for (const name of kit.listTools()) {
    const toolDef = {
      name,
      description: `Built-in payment tool: ${name}`,
      // Ensure FastMCP passes through arguments for built-ins
      // Use permissive schema to avoid stripping reserved params
      parameters: z.object({}).passthrough(),
      async execute(params: any, context: any) {
        return await kit.invoke(name, params, context);
      },
    } as any;
    server.addTool(toolDef);
    bootstrapRegistrar.registeredTools.push(toolDef);
  }

  const registrar = bootstrapRegistrar;

  const start = async () => {
    const sessions: FastMCPSession[] = [];
    let sessionCounter = 0;
    const port = opts.port ?? 8080;
    const endpoint = opts.endpoint || '/mcp';
    // Well-known is enabled by default for payment-enabled MCP servers
    const wellKnownEnabled = opts.wellKnown?.enabled !== false;
    const wellKnownPath = (opts.wellKnown?.path ||
      '/.well-known/nuwa-payment/info') as `/${string}`;

    const httpServer = await startHTTPServer({
      port,
      streamEndpoint: endpoint,
      createServer: async (req: any) => {
        logger.debug('Creating new MCP session', {
          method: req.method,
          url: req.url,
          headers: req.headers,
        } as any);
        
        try {
          const session = new FastMCPSession({
            name: opts.serviceId || 'nuwa-mcp-server',
            version: '1.0.0',
            ping: undefined,
            prompts: registrar.getPrompts(),
            resources: registrar.getResources(),
            resourcesTemplates: registrar.getResourceTemplates(),
            roots: { enabled: true },
            tools: registrar.getTools(),
            transportType: 'httpStream',
          } as any);
          (session as any).__sessionId = ++sessionCounter;
          
          logger.debug('MCP session created', {
            sessionId: (session as any).__sessionId,
            toolCount: registrar.getTools().length,
          } as any);
          
          return session;
        } catch (e) {
          logger.error('Failed to create MCP session', {
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            method: req.method,
            url: req.url,
          } as any);
          throw e;
        }
      },
      onConnect: async (session: any) => {
        sessions.push(session);
        logger.info('MCP session connected', {
          sessionId: (session as any).__sessionId,
          totalSessions: sessions.length,
        } as any);
        // Register all tools to the new session via FastMCP internal handlers
        // We rely on FastMCP having already had tools added via registrar
        // Emit-like behavior is not exposed; sessions will receive handlers on creation
      },
      onClose: async (session: any) => {
        const idx = sessions.indexOf(session as any);
        if (idx >= 0) sessions.splice(idx, 1);
        logger.info('MCP session closed', {
          sessionId: (session as any).__sessionId,
          totalSessions: sessions.length,
        } as any);
      },
      onUnhandledRequest: async (req: any, res: any) => {
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          const url = new URL(req.url || '', 'http://localhost');
          
          logger.debug('Unhandled request', {
            method: req.method,
            pathname: url.pathname,
            headers: req.headers,
          } as any);
          
          // Health endpoint (parity with FastMCP default)
          if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' }).end('✓ Ok');
            return;
          }
          // Ready endpoint (parity with FastMCP default)
          if (req.method === 'GET' && url.pathname === '/ready') {
            const readySessions = sessions.filter(s => (s as any).isReady).length;
            const totalSessions = sessions.length;
            const allReady = readySessions === totalSessions && totalSessions > 0;
            const payload = {
              ready: readySessions,
              status: allReady ? 'ready' : totalSessions === 0 ? 'no_sessions' : 'initializing',
              total: totalSessions,
            };
            res
              .writeHead(allReady ? 200 : 503, { 'Content-Type': 'application/json' })
              .end(JSON.stringify(payload));
            return;
          }
          // Well-known discovery endpoint (no auth)
          if (wellKnownEnabled && req.method === 'GET' && url.pathname === wellKnownPath) {
            try {
              // Auto-generate service discovery info from kit conforming to ServiceDiscoverySchema
              const serviceDid = await kit.getServiceDid();
              const body = {
                version: 1,
                serviceId: opts.serviceId || 'nuwa-mcp-server',
                serviceDid,
                network: opts.network || 'test',
                defaultAssetId: opts.defaultAssetId || '0x3::gas_coin::RGas',
                defaultPricePicoUSD: opts.defaultPricePicoUSD?.toString(),
                basePath: endpoint,
              };
              res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
            } catch (e: any) {
              logger.error('Failed to generate service discovery info', {
                error: e?.message,
                stack: e?.stack,
              } as any);
              
              res
                .writeHead(500, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: e?.message || 'internal error' }));
            }
            return;
          }

          // Try custom route handler first
          if (opts.customRouteHandler) {
            const handled = await opts.customRouteHandler(req, res);
            if (handled) {
              return;
            }
          }

          logger.warn('No handler found for request', {
            method: req.method,
            pathname: url.pathname,
          } as any);
          
          res.writeHead(404).end();
        } catch (e) {
          logger.error('Error in onUnhandledRequest', {
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            method: req?.method,
            url: req?.url,
          } as any);
          
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' }).end(
              JSON.stringify({
                error: e instanceof Error ? e.message : 'Internal server error',
                timestamp: new Date().toISOString(),
              })
            );
          } catch (writeError) {
            logger.error('Failed to write error response', {
              error: writeError instanceof Error ? writeError.message : String(writeError),
            } as any);
          }
        }
      },
    });

    registrar.markStarted();
    logger.debug('registered tools', {
      tools: registrar.getTools().map(t => t.name),
      total: registrar.getTools().length,
    } as any);
    const srv = httpServer as any as StoppableServer;
    logger.info(`FastMCP HTTP server listening at http://localhost:${port}`);
    // Track sockets to force-close on shutdown and avoid hanging closes
    const sockets = new Set<any>();
    try {
      (srv as any).on?.('connection', (socket: any) => {
        sockets.add(socket);
        socket.on?.('close', () => sockets.delete(socket));
      });
    } catch {}
    // Wrap stop/close to ensure kit resources are destroyed
    const originalClose = (srv as any).close?.bind(srv);
    (srv as any).stop = async () => {
      try {
        kit.destroy();
      } catch {}
      // Attempt to terminate open sessions
      try {
        for (const s of sessions.slice()) {
          try {
            (s as any).close?.();
          } catch {}
          try {
            (s as any).terminate?.();
          } catch {}
          try {
            (s as any).dispose?.();
          } catch {}
        }
      } catch {}
      // Close idle and all connections if supported
      try {
        (srv as any).closeIdleConnections?.();
      } catch {}
      try {
        (srv as any).closeAllConnections?.();
      } catch {}
      // Destroy any tracked sockets to ensure shutdown
      try {
        for (const sock of sockets) {
          try {
            sock.destroy?.();
          } catch {}
        }
      } catch {}
      // Finally, close the server with a timeout fallback
      await new Promise<void>(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        try {
          if (typeof originalClose === 'function') {
            originalClose(() => finish());
          } else {
            (srv as any).close?.();
            finish();
          }
        } catch {
          finish();
        }
        // Fallback timeout to avoid hanging forever
        setTimeout(finish, 2000);
      });
    };
    return srv;
  };

  const addTool = (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
    options?: RouteOptions;
  }) => {
    registrar.addTool({
      name: def.name,
      description: def.description,
      schema: def.parameters,
      options: def.options,
      handler: async (params, context) => def.execute(params, context),
    });
  };

  const freeTool = (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => {
    registrar.freeTool({
      name: def.name,
      description: def.description,
      schema: def.parameters,
      handler: async (params, context) => def.execute(params, context),
    });
  };

  const paidTool = (def: {
    name: string;
    description: string;
    pricePicoUSD: bigint;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => {
    registrar.paidTool({
      name: def.name,
      description: def.description,
      pricePicoUSD: def.pricePicoUSD,
      schema: def.parameters,
      handler: async (params, context) => def.execute(params, context),
    });
  };

  const getInner = () => ({ server, kit });

  const addPrompt = (def: {
    name: string;
    description: string;
    arguments?: any[];
    load: (args: any) => Promise<string> | string;
  }) => {
    registrar.addPrompt(def);
  };

  const addResource = (def: {
    uri: string;
    name: string;
    mimeType: string;
    load: () => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }) => {
    registrar.addResource(def);
  };

  const addResourceTemplate = (def: {
    uriTemplate: string;
    name: string;
    mimeType: string;
    arguments?: any[];
    load: (args: any) => Promise<{ text?: string; blob?: any }> | { text?: string; blob?: any };
  }) => {
    registrar.addResourceTemplate(def);
  };

  return {
    addTool,
    freeTool,
    paidTool,
    addPrompt,
    addResource,
    addResourceTemplate,
    start,
    getInner,
  };
}
