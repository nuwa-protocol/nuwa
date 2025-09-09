// Optional convenience starter for FastMCP
// Users can import this to quickly start an MCP server with billing enabled.

import {
  McpPaymentKit,
  createMcpPaymentKit,
  McpPaymentKitOptions,
  createMcpPaymentKitFromEnv,
} from './McpPaymentKit';
import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { Server } from 'http';
import { FastMCP, FastMCPSession } from 'fastmcp';
import { startHTTPServer } from 'mcp-proxy';
import {
  buildParametersSchema,
  compileStandardSchema,
  extendZodWithNuwaReserved,
  normalizeToZodObject,
} from './ToolSchema';

export interface FastMcpServerOptions extends McpPaymentKitOptions {
  port?: number;
  endpoint?: `/${string}`;
  register?: (registrar: PaymentMcpToolRegistrar) => void;
  wellKnown?: {
    enabled?: boolean;
    path?: `/${string}`; // default: '/.well-known/nuwa-payment/info'
    discovery: () => Promise<any> | any; // should conform to ServiceDiscoverySchema
  };
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
    pricePicoUSD: bigint;
    schema?: any;
  }): void {
    this.ensureNotStarted();
    const { name, description, handler, pricePicoUSD, schema } = args;
    // Register with billing (enables pricing/settlement)
    this.kit.register(name, { pricing: pricePicoUSD }, handler);
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
    this.addTool({ ...args, pricePicoUSD: 0n });
  }

  paidTool(args: {
    name: string;
    description: string;
    pricePicoUSD: bigint;
    handler: (params: any, context?: any) => Promise<any>;
    schema?: any;
  }): void {
    this.addTool(args);
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
    nuwa?: { pricePicoUSD?: bigint };
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
  start: () => Promise<Server>;
  getInner: () => { server: FastMCP; kit: McpPaymentKit };
}> {
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
      parameters: undefined,
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
    const port = opts.port || 8080;
    const endpoint = opts.endpoint || '/mcp';
    const wellKnownEnabled =
      opts.wellKnown?.enabled !== false && typeof opts.wellKnown?.discovery === 'function';
    const wellKnownPath = (opts.wellKnown?.path ||
      '/.well-known/nuwa-payment/info') as `/${string}`;

    const httpServer = await startHTTPServer({
      port,
      streamEndpoint: endpoint,
      createServer: async _req => {
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
        return session;
      },
      onConnect: async session => {
        sessions.push(session);
        // Register all tools to the new session via FastMCP internal handlers
        // We rely on FastMCP having already had tools added via registrar
        // Emit-like behavior is not exposed; sessions will receive handlers on creation
      },
      onClose: async session => {
        const idx = sessions.indexOf(session as any);
        if (idx >= 0) sessions.splice(idx, 1);
      },
      onUnhandledRequest: async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost');
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
              const body = await Promise.resolve(opts.wellKnown!.discovery());
              res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
            } catch (e: any) {
              res
                .writeHead(500, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: e?.message || 'internal error' }));
            }
            return;
          }
          res.writeHead(404).end();
        } catch (e) {
          try {
            res.writeHead(500).end();
          } catch {}
        }
      },
    });

    registrar.markStarted();
    console.debug('[FastMcpStarter] registered tools', {
      tools: registrar.getTools().map(t => t.name),
      total: registrar.getTools().length,
    } as any);
    return httpServer as any as Server;
  };

  const addTool = (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
    nuwa?: { pricePicoUSD?: bigint };
  }) => {
    registrar.addTool({
      name: def.name,
      description: def.description,
      schema: def.parameters,
      pricePicoUSD: def.nuwa?.pricePicoUSD ?? 0n,
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
