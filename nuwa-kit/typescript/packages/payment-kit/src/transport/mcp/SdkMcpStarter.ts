// MCP Server using official MCP SDK engine
// Provides drop-in compatibility with FastMcpStarter but uses @modelcontextprotocol/sdk

import { McpPaymentKit, createMcpPaymentKit, McpPaymentKitOptions } from './McpPaymentKit';
import { z } from 'zod';
import type { IdentityEnv } from '@nuwa-ai/identity-kit';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';
import type { Server } from 'http';
import {
  Server as McpServer,
  createServer as createMcpServer
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { extendZodWithNuwaReserved, normalizeToZodObject } from './ToolSchema';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { RouteOptions } from '../express';
import { createServer as createHttpServer } from 'http';
import { parse as parseUrl } from 'url';

// Server type with explicit stop method used by tests and callers
export type StoppableServer = Server & { stop: () => Promise<void> };

export interface SdkMcpServerOptions extends McpPaymentKitOptions {
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
 * Convenience: start SDK MCP server using IdentityEnv (env.keyManager + VDR chain config)
 */
export async function createSdkMcpServerFromEnv(
  env: IdentityEnv,
  opts: Omit<SdkMcpServerOptions, 'signer' | 'rpcUrl' | 'network'>
) {
  const chain = getChainConfigFromEnv(env);
  return createSdkMcpServer({
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
    private readonly server: McpServer,
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

    const paramsSchema = (() => {
      if (!schema) return undefined;
      const zodObj = normalizeToZodObject(schema);
      if (zodObj) return extendZodWithNuwaReserved(zodObj);
      return undefined;
    })();

    const toolDef = {
      name,
      description,
      inputSchema: paramsSchema ? zodToJsonSchema(paramsSchema) : undefined,
    };

    this.registeredTools.push({
      ...toolDef,
      handler: async (params: any) => {
        return await this.kit.invoke(name, params, {});
      },
    });
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
    } as any;
    this.registeredPrompts.push({
      ...promptDef,
      load: def.load,
    });
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
    } as any;
    this.registeredResources.push({
      ...resDef,
      load: def.load,
    });
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
    } as any;
    this.registeredResourceTemplates.push({
      ...tplDef,
      load: def.load,
    });
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

// Helper to convert Zod schema to JSON Schema
function zodToJsonSchema(zodSchema: any): any {
  try {
    // Import zod-to-json-schema dynamically
    const { zodToJsonSchema: convert } = require('zod-to-json-schema');
    return convert(zodSchema);
  } catch {
    // Fallback if conversion fails
    return undefined;
  }
}

export async function createSdkMcpServer(opts: SdkMcpServerOptions): Promise<{
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
  getInner: () => { server: McpServer; kit: McpPaymentKit };
}> {
  const logger = DebugLogger.get('SdkMcpStarter');

  const server = createMcpServer(
    {
      name: opts.serviceId || 'nuwa-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        resourceTemplates: {},
      },
    }
  );

  const kit = await createMcpPaymentKit(opts);

  // Register built-in payment tools via registrar
  const bootstrapRegistrar = new PaymentMcpToolRegistrar(server, kit);

  // Register each tool from kit
  for (const name of kit.listTools()) {
    const toolDef = {
      name,
      description: `Built-in payment tool: ${name}`,
      inputSchema: undefined, // Use permissive schema
    };

    bootstrapRegistrar.registeredTools.push({
      ...toolDef,
      handler: async (params: any) => {
        return await kit.invoke(name, params, {});
      },
    });
  }

  const registrar = bootstrapRegistrar;

  // Set up request handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registrar.getTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = registrar.getTools().find(t => t.name === name);

    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      const result = await tool.handler(args);
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: registrar.getPrompts(),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = registrar.getPrompts().find((p: any) => p.name === name);

    if (!prompt) {
      throw new Error(`Prompt '${name}' not found`);
    }

    const result = await prompt.load(args);
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: result,
          },
        },
      ],
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: registrar.getResources(),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const resource = registrar.getResources().find((r: any) => r.uri === uri);

    if (!resource) {
      throw new Error(`Resource '${uri}' not found`);
    }

    const result = await resource.load();
    return {
      contents: [
        {
          uri,
          mimeType: resource.mimeType,
          ...result,
        },
      ],
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: registrar.getResourceTemplates(),
    };
  });

  const start = async () => {
    const port = opts.port ?? 8080;
    const endpoint = opts.endpoint || '/mcp';
    const wellKnownEnabled = opts.wellKnown?.enabled !== false;
    const wellKnownPath = (opts.wellKnown?.path ||
      '/.well-known/nuwa-payment/info') as `/${string}`;

    const httpServer = createHttpServer((req: any, res: any) => {
      const url = parseUrl(req.url || '', true);

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health endpoint
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('✓ Ok');
        return;
      }

      // Ready endpoint
      if (req.method === 'GET' && url.pathname === '/ready') {
        const payload = {
          ready: 1,
          status: 'ready',
          total: 1,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
        return;
      }

      // Well-known discovery endpoint
      if (wellKnownEnabled && req.method === 'GET' && url.pathname === wellKnownPath) {
        try {
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
          res.writeHead(500, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ error: e?.message || 'internal error' }));
        }
        return;
      }

      // Try custom route handler
      if (opts.customRouteHandler) {
        opts.customRouteHandler(req, res).then((handled) => {
          if (!handled) {
            res.writeHead(404).end();
          }
        }).catch(() => {
          res.writeHead(500).end();
        });
        return;
      }

      res.writeHead(404).end();
    });

    // Set up SSE transport for MCP
    const sseTransport = new SSEServerTransport('/mcp', res);

    // Connect the MCP server to the SSE transport
    await server.connect(sseTransport);

    registrar.markStarted();

    logger.debug('registered tools', {
      tools: registrar.getTools().map(t => t.name),
      total: registrar.getTools().length,
    } as any);

    const srv = httpServer as any as StoppableServer;
    logger.info(`SDK MCP HTTP server listening at http://localhost:${port}`);

    // Wrap stop/close to ensure kit resources are destroyed
    const originalClose = srv.close?.bind(srv);
    (srv as any).stop = async () => {
      try {
        kit.destroy();
      } catch {}
      try {
        await server.close();
      } catch {}
      try {
        await new Promise<void>((resolve) => {
          if (typeof originalClose === 'function') {
            originalClose(() => resolve());
          } else {
            resolve();
          }
        });
      } catch {}
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