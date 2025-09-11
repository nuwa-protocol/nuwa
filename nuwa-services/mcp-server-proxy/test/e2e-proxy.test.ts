import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer, registerRoutes, ToolRegistry } from '../src/server.js';

// Helper to start embedded MCP server in-process
async function startServer() {
  const config = { port: 5100, endpoint: '/mcp', register: { tools: [] } };
  const { server } = createServer();

  // Register minimal tools for testing
  const registry = new ToolRegistry();
  registry.register({
    name: 'echo.free',
    description: 'Echo text',
    parameters: { type: 'object', properties: { text: { type: 'string' } } },
    execute: async (p: any) => ({ text: String(p?.text ?? '') }),
  });
  registry.register({
    name: 'calc.add',
    description: 'Add two numbers',
    parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
    execute: async (p: any) => ({ sum: Number(p?.a ?? 0) + Number(p?.b ?? 0) }),
  });

  registerRoutes(server, config as any, registry);
  await server.listen({ host: '127.0.0.1', port: 5100 });
  return { server };
}

describe('Embedded MCP e2e', () => {
  let svc: any;
  let mcpClient: any;

  beforeAll(async () => {
    svc = await startServer();
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5100/mcp'));
    mcpClient = new Client({ name: 'e2e-test', version: '0.0.1' }, {});
    await mcpClient.connect(transport);
  }, 20000);

  afterAll(async () => {
    await mcpClient.close();
    await svc.server.close();
  });

  it('tools/list returns built-in tools', async () => {
    const res = await mcpClient.listTools();
    const names = res.tools.map((t: any) => t.name);
    expect(names).toContain('echo.free');
    expect(names).toContain('calc.add');
  });

  it('tools/call echo.free echoes text', async () => {
    const res = await mcpClient.callTool({ name: 'echo.free', arguments: { text: 'hello' } });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toContain('hello');
  });

  it('tools/call calc.add returns sum', async () => {
    const res = await mcpClient.callTool({ name: 'calc.add', arguments: { a: 2, b: 3 } });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    const obj = JSON.parse(res.content[0].text);
    expect(obj.sum).toBe(5);
  });
});