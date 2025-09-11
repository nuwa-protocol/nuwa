import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createFastMcpServer } from '@nuwa-ai/payment-kit';
import { KeyManager } from '@nuwa-ai/identity-kit';
import { z } from 'zod';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Start proxy server in-process using FastMcpStarter (code path)
async function startServer(): Promise<{ stop: () => Promise<void> }> {
  const { keyManager } = await KeyManager.createWithDidKey();
  const app: any = await createFastMcpServer({
    serviceId: 'test-service',
    signer: keyManager as any,
    rpcUrl: 'http://127.0.0.1:6767',
    network: 'test' as any,
    port: 5100,
    endpoint: '/mcp' as any,
  } as any);
  // Register tools before start
  app.freeTool({
    name: 'echo.free',
    description: 'Echo text',
    parameters: z.object({ text: z.string().optional() }),
    execute: async (p: any) => String(p?.text ?? ''),
  });
  app.freeTool({
    name: 'calc.add',
    description: 'Add two numbers',
    parameters: z.object({ a: z.number(), b: z.number() }),
    execute: async (p: any) => ({ sum: Number(p?.a ?? 0) + Number(p?.b ?? 0) }),
  });
  const server: any = await app.start();
  return { stop: async () => { try { await server.stop(); } catch {} } };
}

describe('Proxy MCP e2e', () => {
  let svc: { stop: () => Promise<void> } | undefined;
  let mcpClient: any;

  beforeAll(async () => {
    svc = await startServer();
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5100/mcp'));
    mcpClient = new Client({ name: 'e2e-test', version: '0.0.1' }, {});
    await mcpClient.connect(transport);
  }, 30000);

  afterAll(async () => {
    try { await mcpClient?.close?.(); } catch {}
    try { await svc?.stop?.(); } catch {}
  });

  it('tools/list returns built-in tools', async () => {
    const tools = await mcpClient.listTools();
    const list = Array.isArray((tools as any).tools) ? (tools as any).tools : (tools as any);
    const names = list.map((t: any) => t.name);
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