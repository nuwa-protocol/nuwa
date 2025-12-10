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
    // Set a test environment variable
    process.env.TEST_INHERITED_VAR = 'inherited_value';

    upstream = await initUpstream({
      type: 'stdio',
      command: ['node', script],
      cwd: process.cwd(),
      env: {
        TEST_CUSTOM_VAR: 'custom_value',
      },
    } as any);
  }, 10000);

  afterAll(async () => {
    await upstream.client.close();
    // Clean up test environment variable
    delete process.env.TEST_INHERITED_VAR;
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

describe('Upstream (stdio) stderr output', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/stderr-test-mcp.js');

  it('should display stderr output with inherit mode (default)', async () => {
    let upstream: any;

    try {
      // Test with default stderr configuration (should be 'inherit')
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
      } as any);

      // Call a tool that outputs to stderr
      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'test message for stderr' },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].text).toBe('Processed: test message for stderr');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);

  it('should handle stderr configuration options', async () => {
    let upstream: any;

    try {
      // Test with explicit stderr: 'inherit'
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
        stderr: 'inherit',
      } as any);

      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'explicit inherit test' },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBe('Processed: explicit inherit test');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);
});

describe('Upstream (stdio) environment variable inheritance', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/env-test-mcp.js');

  let upstream: any;

  beforeAll(async () => {
    // Set test environment variables
    process.env.TEST_INHERITED_VAR = 'inherited_value';
    process.env.PATH = process.env.PATH || '/usr/bin'; // Ensure PATH exists

    upstream = await initUpstream({
      type: 'stdio',
      command: ['node', script],
      cwd: process.cwd(),
      env: {
        TEST_CUSTOM_VAR: 'custom_value',
      },
    } as any);
  }, 10000);

  afterAll(async () => {
    await upstream.client.close();
    // Clean up test environment variables
    delete process.env.TEST_INHERITED_VAR;
  });

  it('child process should inherit parent environment variables', async () => {
    const result = await upstream.client.callTool({
      name: 'check_env',
      arguments: { varName: 'TEST_INHERITED_VAR' },
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].text).toBe('TEST_INHERITED_VAR=inherited_value');
  });

  it('child process should have custom environment variables', async () => {
    const result = await upstream.client.callTool({
      name: 'check_env',
      arguments: { varName: 'TEST_CUSTOM_VAR' },
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].text).toBe('TEST_CUSTOM_VAR=custom_value');
  });

  it('child process should have system PATH variable', async () => {
    const result = await upstream.client.callTool({
      name: 'check_env',
      arguments: { varName: 'PATH' },
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].text).toContain('PATH=');
    expect(result.content[0].text).not.toBe('PATH not found');
  });

  it('child process should have reasonable number of environment variables', async () => {
    const result = await upstream.client.callTool({
      name: 'list_env',
      arguments: {},
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    // Should have at least some environment variables (typically 20+ on most systems)
    expect(result.content[0].text).toMatch(/Found \d+ environment variables/);
    const match = result.content[0].text.match(/Found (\d+) environment variables/);
    if (match) {
      const count = parseInt(match[1]);
      expect(count).toBeGreaterThan(5); // Should have more than just a few vars
    }
  });
});

describe('Upstream (stdio) stderr output', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/stderr-test-mcp.js');

  it('should display stderr output with inherit mode (default)', async () => {
    let upstream: any;

    try {
      // Test with default stderr configuration (should be 'inherit')
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
      } as any);

      // Call a tool that outputs to stderr
      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'test message for stderr' },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].text).toBe('Processed: test message for stderr');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);

  it('should handle stderr configuration options', async () => {
    let upstream: any;

    try {
      // Test with explicit stderr: 'inherit'
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
        stderr: 'inherit',
      } as any);

      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'explicit inherit test' },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBe('Processed: explicit inherit test');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);
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
      waitOn({ resources: ['tcp:4000'], timeout: 10000 }, err => {
        if (err) reject(err);
        else resolve();
      });
    });
    upstream = await initUpstream({
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

describe('Upstream (stdio) stderr output', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/stderr-test-mcp.js');

  it('should display stderr output with inherit mode (default)', async () => {
    let upstream: any;

    try {
      // Test with default stderr configuration (should be 'inherit')
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
      } as any);

      // Call a tool that outputs to stderr
      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'test message for stderr' },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].text).toBe('Processed: test message for stderr');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);

  it('should handle stderr configuration options', async () => {
    let upstream: any;

    try {
      // Test with explicit stderr: 'inherit'
      upstream = await initUpstream({
        type: 'stdio',
        command: ['node', script],
        cwd: process.cwd(),
        stderr: 'inherit',
      } as any);

      const result = await upstream.client.callTool({
        name: 'test_stderr',
        arguments: { message: 'explicit inherit test' },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBe('Processed: explicit inherit test');
    } finally {
      if (upstream) {
        await upstream.client.close();
      }
    }
  }, 10000);
});
