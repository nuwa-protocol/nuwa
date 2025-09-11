import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { initUpstream } from '../src/upstream.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'child_process';
import waitOn from 'wait-on';

// If you see a linter error for 'wait-on', please run:
//   npm install --save-dev wait-on
// or
//   pnpm add -D wait-on
// before running the tests.

describe('Upstream (stdio) integration', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/stdio-mock-mcp.js');

  let upstream: any;

  beforeAll(async () => {
    upstream = await initUpstream('mock', {
      type: 'stdio',
      command: ['node', script],
      cwd: process.cwd(),
    } as any);
  }, 10000);

  afterAll(async () => {
    await upstream.client.close();
  });

  it('upstream exposes capabilities', async () => {
    expect(upstream.capabilities).toBeDefined();
    expect(typeof upstream.capabilities).toBe('object');
    // At least one of the main capability keys should exist
    expect(
      'tools' in upstream.capabilities ||
      'prompts' in upstream.capabilities ||
      'resources' in upstream.capabilities
    ).toBe(true);
  });

  it('upstream client can list tools', async () => {
    const tools = await upstream.client.listTools();
    expect(tools.tools).toBeDefined();
    expect(Array.isArray(tools.tools)).toBe(true);
    expect(tools.tools[0].name).toBe('echo');
  });

  it('upstream client can call tools', async () => {
    const result = await upstream.client.callTool({ name: 'echo', arguments: { text: 'hello' } });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].text).toBe('hello');
  });
});

describe('Upstream (httpStream) integration', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/http-mock-mcp.js');

  let upstream: any;
  let serverProcess: any;

  beforeAll(async () => {
    // Start the mock HTTP MCP server
    serverProcess = fork(script, [], { stdio: 'ignore' });
    // Wait for the server to be ready
    await new Promise<void>((resolve, reject) => {
      waitOn({ resources: ['tcp:4000'], timeout: 10000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    upstream = await initUpstream('mock-http', {
      type: 'httpStream',
      url: 'http://localhost:4000/mcp',
    } as any);
  }, 15000);

  afterAll(async () => {
    await upstream.client.close();
    serverProcess.kill();
  });

  it('upstream exposes capabilities', async () => {
    expect(upstream.capabilities).toBeDefined();
    expect(typeof upstream.capabilities).toBe('object');
    expect(
      'tools' in upstream.capabilities ||
      'prompts' in upstream.capabilities ||
      'resources' in upstream.capabilities
    ).toBe(true);
  });

  it('upstream client can list tools', async () => {
    const tools = await upstream.client.listTools();
    expect(tools.tools).toBeDefined();
    expect(Array.isArray(tools.tools)).toBe(true);
    expect(tools.tools[0].name).toBe('echo');
  });

  it('upstream client can call tools', async () => {
    const result = await upstream.client.callTool({ name: 'echo', arguments: { text: 'hello' } });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].text).toBe('hello');
  });
}); 