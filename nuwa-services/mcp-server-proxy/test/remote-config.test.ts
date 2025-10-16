import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { loadConfig } from '../src/config.js';

describe('Remote Configuration Loading', () => {
  let mockServer: any;
  let serverUrl: string;

  beforeAll(async () => {
    // Create a mock HTTP server to serve configuration
    mockServer = createServer((req, res) => {
      if (req.url === '/config.yaml') {
        res.writeHead(200, { 'Content-Type': 'text/yaml' });
        res.end(`
port: 9999
endpoint: "/remote-mcp"
serviceId: "remote-test-service"
network: "dev"
debug: true
upstream:
  type: "httpStream"
  url: "https://remote.example.com/mcp"
  auth:
    scheme: "bearer"
    token: "\${REMOTE_API_TOKEN}"
register:
  tools:
    - name: "remote.tool"
      pricePicoUSD: "500000000"
`);
      } else if (req.url === '/config-with-env.yaml') {
        res.writeHead(200, { 'Content-Type': 'text/yaml' });
        res.end(`
port: \${TEST_PORT}
serviceId: "env-test-service"
upstream:
  type: "httpStream"
  url: "https://api.example.com/mcp?key=\${TEST_API_KEY}"
`);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, () => {
        const port = mockServer.address().port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
  });

  it('should load configuration from remote URL', async () => {
    // Clear argv to avoid interference
    process.argv = ['node', 'server.js', '--config', `${serverUrl}/config.yaml`];
    
    const config = await loadConfig();
    
    expect(config.port).toBe(9999);
    expect(config.endpoint).toBe('/remote-mcp');
    expect(config.serviceId).toBe('remote-test-service');
    expect(config.network).toBe('dev');
    expect(config.debug).toBe(true);
    expect(config.upstream?.type).toBe('httpStream');
    expect((config.upstream as any)?.url).toBe('https://remote.example.com/mcp');
    expect((config.upstream as any)?.auth?.scheme).toBe('bearer');
    expect(config.register?.tools).toHaveLength(1);
    expect(config.register?.tools[0].name).toBe('remote.tool');
    expect(config.register?.tools[0].pricePicoUSD).toBe('500000000');
  });

  it('should handle environment variable substitution in remote config', async () => {
    // Set test environment variables
    process.env.TEST_PORT = '7777';
    process.env.TEST_API_KEY = 'remote-secret-key';
    
    process.argv = ['node', 'server.js', '--config', `${serverUrl}/config-with-env.yaml`];
    
    const config = await loadConfig();
    
    expect(config.port).toBe(7777);
    expect(config.serviceId).toBe('env-test-service');
    expect(config.upstream?.type).toBe('httpStream');
    expect((config.upstream as any)?.url).toBe('https://api.example.com/mcp?key=remote-secret-key');
    
    // Clean up
    delete process.env.TEST_PORT;
    delete process.env.TEST_API_KEY;
  });

  it('should handle remote config loading errors gracefully', async () => {
    process.argv = ['node', 'server.js', '--config', `${serverUrl}/nonexistent.yaml`];
    
    // Mock process.exit to prevent actual exit during test
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('Process exit called');
    }) as any;
    
    try {
      await expect(loadConfig()).rejects.toThrow('Process exit called');
      expect(exitCode).toBe(1);
    } finally {
      // Restore original process.exit
      process.exit = originalExit;
    }
  });

  it('should prioritize environment CONFIG_PATH over default', async () => {
    process.argv = ['node', 'server.js'];
    process.env.CONFIG_PATH = `${serverUrl}/config.yaml`;
    
    const config = await loadConfig();
    
    expect(config.port).toBe(9999);
    expect(config.serviceId).toBe('remote-test-service');
    
    // Clean up
    delete process.env.CONFIG_PATH;
  });
});
