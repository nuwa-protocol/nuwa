// Optional convenience starter for FastMCP
// Users can import this to quickly start an MCP server with billing enabled.

import { McpPaymentKit, createMcpPaymentKit, McpPaymentKitOptions } from './McpPaymentKit';
import type { Server } from 'http';
import { FastMCP } from 'fastmcp';

export interface FastMcpServerOptions extends McpPaymentKitOptions {
  port?: number;
  tools?: Record<
    string,
    {
      description: string;
      inputSchema: any;
      handler: (params: any, context?: any) => Promise<any>;
      options: { pricePicoUSD: bigint; streaming?: boolean };
    }
  >;
}

export async function startFastMcpServer(opts: FastMcpServerOptions): Promise<Server> {
  const server = new FastMCP({
    name: opts.serviceId || 'nuwa-mcp-server',
    version: '1.0.0',
  });
  const kit = await createMcpPaymentKit(opts);

  // Minimal StandardSchemaV1 pass-through to avoid server-side validation errors
  const passThroughParameters: any = {
    ['~standard']: {
      version: '1.0.0',
      validate: async (input: any) => ({ value: input, issues: undefined }),
    },
  };

  // Register built-in payment tools
  const handlers = kit.getHandlers();
  console.log(`[FastMcpStarter] Built-in handlers: ${Object.keys(handlers).join(', ')}`);
  for (const [name, fn] of Object.entries(handlers)) {
    console.log(`[FastMcpStarter] Registering built-in tool: ${name}`);
    server.addTool({
      name,
      description: `Built-in payment tool: ${name}`,
      parameters: passThroughParameters,
      async execute(params: any, context: any) {
        const raw = await fn(params, context);
        return { content: [{ type: 'text', text: JSON.stringify(raw) }] } as any;
      },
    });
  }

  // Register custom business tools
  if (opts.tools) {
    console.log(`[FastMcpStarter] Custom tools: ${Object.keys(opts.tools).join(', ')}`);
    for (const [name, tool] of Object.entries(opts.tools)) {
      console.log(`[FastMcpStarter] Registering custom tool: ${name}`);
      // Register tool with billing
      const routeOptions = {
        pricePicoUSD: tool.options.pricePicoUSD,
        streaming: tool.options.streaming,
        pricing: tool.options.pricePicoUSD,
      };
      kit.register(name, routeOptions, tool.handler);

      // Add to FastMCP server
      server.addTool({
        name,
        description: tool.description,
        parameters: passThroughParameters,
        async execute(params: any, context: any) {
          const raw = await tool.handler(params, context);
          return { content: [{ type: 'text', text: JSON.stringify(raw) }] } as any;
        },
      });
    }
  } else {
    console.log(`[FastMcpStarter] No custom tools provided`);
  }

  // Start the server using HTTP Stream (compatible with MCP SDK HTTPClientTransport base URL)
  await server.start({
    transportType: 'httpStream',
    httpStream: {
      port: opts.port || 8080,
      endpoint: '/mcp',
    },
  });

  // Return the underlying MCP server instance
  return server as any;
}
