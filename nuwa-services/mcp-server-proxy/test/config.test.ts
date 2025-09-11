import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Config Module', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;
  let testConfigPath: string;

  beforeEach(() => {
    // Save original state
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    testConfigPath = path.join(__dirname, 'test-config.yaml');
  });

  afterEach(() => {
    // Restore original state
    process.argv = originalArgv;
    process.env = originalEnv;
    
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load default configuration', () => {
    // Clear argv to avoid interference
    process.argv = ['node', 'server.js'];
    
    const config = loadConfig();
    
    expect(config.port).toBe(8088);
    expect(config.endpoint).toBe('/mcp');
    expect(config.network).toBe('test');
    expect(config.debug).toBe(false);
  });

  it('should prioritize environment variables over defaults', () => {
    process.argv = ['node', 'server.js'];
    process.env.PORT = '9000';
    process.env.DEBUG = 'true';
    process.env.UPSTREAM_URL = 'https://env.example.com/mcp';
    
    const config = loadConfig();
    
    expect(config.port).toBe(9000);
    expect(config.debug).toBe(true);
    expect(config.upstreamUrl).toBe('https://env.example.com/mcp');
  });

  it('should prioritize config file over defaults', () => {
    process.argv = ['node', 'server.js'];
    
    // Create test config file
    const testConfig = `
port: 7000
endpoint: "/test-mcp"
debug: true
upstreamUrl: "https://file.example.com/mcp"
serviceId: "test-service"
network: "dev"
`;
    fs.writeFileSync(testConfigPath, testConfig);
    process.env.CONFIG_PATH = testConfigPath;
    
    const config = loadConfig();
    
    expect(config.port).toBe(7000);
    expect(config.endpoint).toBe('/test-mcp');
    expect(config.debug).toBe(true);
    expect(config.upstreamUrl).toBe('https://file.example.com/mcp');
    expect(config.serviceId).toBe('test-service');
    expect(config.network).toBe('dev');
  });

  it('should prioritize CLI args over everything else', () => {
    process.argv = ['node', 'server.js', '--port', '6000', '--debug', '--upstream-url', 'https://cli.example.com/mcp'];
    process.env.PORT = '9000';
    process.env.UPSTREAM_URL = 'https://env.example.com/mcp';
    
    // Create test config file
    const testConfig = `
port: 7000
upstreamUrl: "https://file.example.com/mcp"
`;
    fs.writeFileSync(testConfigPath, testConfig);
    process.env.CONFIG_PATH = testConfigPath;
    
    const config = loadConfig();
    
    expect(config.port).toBe(6000);
    expect(config.debug).toBe(true);
    expect(config.upstreamUrl).toBe('https://cli.example.com/mcp');
  });

  it('should handle environment variable substitution in config file', () => {
    process.argv = ['node', 'server.js'];
    process.env.TEST_API_KEY = 'secret123';
    process.env.TEST_RPC_URL = 'https://test-rpc.example.com';
    
    // Create test config file with env vars
    const testConfig = `
port: 8000
upstreamUrl: "https://api.example.com/mcp?key=\${TEST_API_KEY}"
rpcUrl: "\${TEST_RPC_URL}"
serviceId: "test-service"
`;
    fs.writeFileSync(testConfigPath, testConfig);
    process.env.CONFIG_PATH = testConfigPath;
    
    const config = loadConfig();
    
    expect(config.upstreamUrl).toBe('https://api.example.com/mcp?key=secret123');
    expect(config.rpcUrl).toBe('https://test-rpc.example.com');
  });

  it('should handle custom tools from config file', () => {
    process.argv = ['node', 'server.js'];
    
    // Create test config file with custom tools
    const testConfig = `
port: 8000
register:
  tools:
    - name: "custom.tool"
      description: "A custom tool"
      pricePicoUSD: "1000000000000"
      parameters:
        type: "object"
        properties:
          input:
            type: "string"
    - name: "free.tool"
      description: "A free tool"
      pricePicoUSD: "0"
`;
    fs.writeFileSync(testConfigPath, testConfig);
    process.env.CONFIG_PATH = testConfigPath;
    
    const config = loadConfig();
    
    expect(config.register?.tools).toHaveLength(2);
    expect(config.register?.tools[0].name).toBe('custom.tool');
    expect(config.register?.tools[0].pricePicoUSD).toBe('1000000000000');
    expect(config.register?.tools[1].name).toBe('free.tool');
    expect(config.register?.tools[1].pricePicoUSD).toBe('0');
  });
});
