import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { fork, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import { createServer, initializeUpstreams, registerRoutes } from '../src/server.js';
import type { ProxyConfig } from '../src/types.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to start proxy server in-process
async function startProxy(config: ProxyConfig) {
  const upstreams = await initializeUpstreams(config);
  const { server } = createServer(config);
  registerRoutes(server, config, upstreams);
  await server.listen({ host: config.server.host, port: config.server.port });
  return { server, upstreams };
}

describe('Proxy e2e', () => {
  let mockProcess: ChildProcess;
  let proxy: any;
  let mcpClient: any;

  beforeAll(async () => {
    // Start mock HTTP MCP server
    const mockScript = path.resolve(__dirname, 'fixtures/http-mock-mcp.js');
    mockProcess = fork(mockScript, [], { stdio: 'ignore' });
    await waitOn({ resources: ['tcp:4000'], timeout: 10000 });

    // Prepare proxy config
    const config: ProxyConfig = {
      server: {
        host: '127.0.0.1',
        port: 5100,
        logger: { level: 'silent', prettyPrint: false },
        cors: { origin: '*', methods: ['GET', 'POST'] },
      } as any,
      didAuth: { required: false } as any,
      defaultUpstream: 'mock-http',
      routes: [],
      upstreams: {
        'mock-http': {
          type: 'httpStream',
          url: 'http://localhost:4000/mcp',
        } as any,
      },
    } as any;

    proxy = await startProxy(config);
    await waitOn({ resources: ['tcp:5100'], timeout: 10000 });

    // Create MCP client pointing to proxy
    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5100/mcp'));
    mcpClient = new Client({ name: 'e2e-test', version: '0.0.1' }, {});
    await mcpClient.connect(transport);
  }, 25000);

  afterAll(async () => {
    await mcpClient.close();
    await proxy.server.close();
    mockProcess.kill();
  });

  it('listTools returns echo tool', async () => {
    const res = await mcpClient.listTools();
    expect(res.tools[0].name).toBe('echo');
  });

  it('listPrompts returns hello prompt', async () => {
    const res = await mcpClient.listPrompts();
    expect(res.prompts[0].name).toBe('hello');
  });

  it('getPrompt returns correct message', async () => {
    const res = await mcpClient.getPrompt({ name: 'hello' });
    expect(res.messages[0].content.text).toBe('Hello, world!');
  });
}); 