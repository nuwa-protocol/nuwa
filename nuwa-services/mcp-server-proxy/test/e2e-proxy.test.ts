import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { fork, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import type { MinimalConfig } from '../src/config.js';

// Start mock upstream MCP server
async function startMockUpstream(): Promise<ChildProcess> {
  const proc = fork('./test/fixtures/http-mock-mcp.js', [], { stdio: 'ignore' });
  await waitOn({ resources: ['tcp:4000'], timeout: 10000 });
  return proc;
}

// Start the actual proxy server directly using the exported startServer function
async function startProxyServer(): Promise<{ close: () => Promise<void> }> {
  // Create test configuration
  const config: MinimalConfig = {
    port: 5100,
    endpoint: '/mcp',
    upstreamUrl: 'http://127.0.0.1:4000/mcp',
    serviceId: 'test-service',
    serviceKey: 'test-key-placeholder',
    network: 'test',
    debug: false,
    register: {
      tools: []
    }
  };

  // Use the exported startServer function
  return await startServer(config);
}

describe('Proxy MCP e2e', () => {
  let proxyServer: { close: () => Promise<void> } | undefined;
  let upstreamProc: ChildProcess | undefined;
  let mcpClient: any;

  beforeAll(async () => {
    // Start mock upstream first
    upstreamProc = await startMockUpstream();
    
    // Start the actual proxy server directly
    proxyServer = await startProxyServer();
    
    // Connect MCP client to proxy
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5100/mcp'));
    mcpClient = new Client({ name: 'e2e-test', version: '0.0.1' }, {});
    await mcpClient.connect(transport);
  }, 30000);

  afterAll(async () => {
    try { await mcpClient?.close?.(); } catch {}
    try { await proxyServer?.close?.(); } catch {}
    try { upstreamProc?.kill('SIGTERM'); } catch {}
  });

  it('tools/list returns upstream forwarded tools', async () => {
    const tools = await mcpClient.listTools();
    const list = Array.isArray((tools as any).tools) ? (tools as any).tools : (tools as any);
    const names = list.map((t: any) => t.name);
    console.log('Available tools:', names);
    
    // Should contain payment kit built-in tools
    expect(names).toContain('nuwa.health');
    expect(names).toContain('nuwa.discovery');
    
    // Should contain upstream 'echo' tool
    expect(names).toContain('echo');
  });

  it('can forward calls to upstream MCP server', async () => {
    // The mock upstream has an 'echo' tool, which should be forwarded
    const res = await mcpClient.callTool({ name: 'echo', arguments: { text: 'upstream test' } });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toBe('upstream test');
  });

  it('payment kit built-in tools are available', async () => {
    // Test that payment kit's built-in tools work
    const res = await mcpClient.callTool({ name: 'nuwa.health', arguments: {} });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    // Health check should return some status information
    expect(res.content[0].text).toBeDefined();
  });
});