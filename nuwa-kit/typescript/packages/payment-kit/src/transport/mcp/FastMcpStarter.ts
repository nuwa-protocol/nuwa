// Optional convenience starter for FastMCP
// Users can import this to quickly start an MCP server with billing enabled.

import { McpPaymentKit, createMcpPaymentKit, McpPaymentKitOptions } from './McpPaymentKit';
import type { Server } from 'http';
import { FastMCP } from 'fastmcp';
import { buildParametersSchema, compileStandardSchema } from './ToolSchema';
import { serializeJson } from '../../utils/json';

function toMcpToolResult(raw: any): any {
  // MCP规范：返回 ToolResult，仅包含 content。将业务数据与支付信息包装为首个 text JSON。
  const container: any = {};
  if (raw && typeof raw === 'object' && 'data' in raw) container.data = (raw as any).data;
  else container.data = raw;
  if (raw && typeof raw === 'object' && (raw as any).__nuwa_payment) {
    container.__nuwa_payment = (raw as any).__nuwa_payment;
  }
  return { content: [{ type: 'text', text: serializeJson(container) }] } as any;
}

export interface FastMcpServerOptions extends McpPaymentKitOptions {
  port?: number;
  register?: (registrar: PaymentMcpToolRegistrar) => void;
}

export class PaymentMcpToolRegistrar {
  private readonly passThroughParameters: any;
  private started = false;
  constructor(
    private readonly server: FastMCP,
    private readonly kit: McpPaymentKit
  ) {
    this.passThroughParameters = undefined;
  }

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
    streaming?: boolean;
    schema?: any;
  }): void {
    this.ensureNotStarted();
    const { name, description, handler, pricePicoUSD, streaming, schema } = args;
    // Register with billing (enables pricing/settlement)
    this.kit.register(name, { pricing: pricePicoUSD, streaming }, handler);
    // Register with FastMCP (expose tool) via unified kit.invoke
    const compiled =
      schema && typeof schema === 'object' && schema['~standard']
        ? schema
        : compileStandardSchema(buildParametersSchema(schema, { mergeReserved: true }));
    const kitRef = this.kit;
    this.server.addTool({
      name,
      description,
      parameters: compiled,
      async execute(params: any, context: any) {
        return await kitRef.invoke(name, params, context);
      },
    });
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
    streaming?: boolean;
    schema?: any;
  }): void {
    this.addTool(args);
  }
}

export async function createFastMcpServer(opts: FastMcpServerOptions): Promise<{
  addTool: (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
    nuwa?: { pricePicoUSD?: bigint; streaming?: boolean };
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
    streaming?: boolean;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => void;
  start: () => Promise<Server>;
  getInner: () => { server: FastMCP; kit: McpPaymentKit };
}> {
  const server = new FastMCP({
    name: opts.serviceId || 'nuwa-mcp-server',
    version: '1.0.0',
  });
  const kit = await createMcpPaymentKit(opts);

  // Register built-in payment tools (FREE)
  for (const name of kit.listTools()) {
    server.addTool({
      name,
      description: `Built-in payment tool: ${name}`,
      parameters: compileStandardSchema(buildParametersSchema(undefined, { mergeReserved: true })),
      async execute(params: any, context: any) {
        return await kit.invoke(name, params, context);
      },
    });
  }

  const registrar = new PaymentMcpToolRegistrar(server, kit);

  const start = async () => {
    await server.start({
      transportType: 'httpStream',
      httpStream: { port: opts.port || 8080, endpoint: '/mcp' },
    });
    registrar.markStarted();
    return server as any as Server;
  };

  const addTool = (def: {
    name: string;
    description: string;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
    nuwa?: { pricePicoUSD?: bigint; streaming?: boolean };
  }) => {
    registrar.addTool({
      name: def.name,
      description: def.description,
      schema: def.parameters,
      pricePicoUSD: def.nuwa?.pricePicoUSD ?? 0n,
      streaming: def.nuwa?.streaming,
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
    streaming?: boolean;
    parameters?: any;
    execute: (params: any, context?: any) => Promise<any> | any;
  }) => {
    registrar.paidTool({
      name: def.name,
      description: def.description,
      pricePicoUSD: def.pricePicoUSD,
      streaming: def.streaming,
      schema: def.parameters,
      handler: async (params, context) => def.execute(params, context),
    });
  };

  const getInner = () => ({ server, kit });

  return { addTool, freeTool, paidTool, start, getInner };
}
