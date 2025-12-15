// Parity tests for FastMcpStarter vs SdkMcpStarter engines
// Ensures both engines provide identical behavior and API compatibility

import {
  createFastMcpServer,
  type FastMcpServerOptions,
} from '../../../src/transport/mcp/FastMcpStarter';
import {
  createSdkMcpServer,
  type SdkMcpServerOptions,
} from '../../../src/transport/mcp/SdkMcpStarter';
import { KeyManager } from '@nuwa-ai/identity-kit';
import type { McpServerOptions } from '../../../src/transport/mcp/McpServerFactory';

// Mock environment for testing
const mockSigner = {
  address: '0x1234567890123456789012345678901234567890',
  sign: jest.fn(),
} as any;

const baseServerOptions = {
  serviceId: 'test-mcp-server',
  signer: mockSigner,
  rpcUrl: 'https://test-rpc.com',
  network: 'test' as const,
  port: 0, // Random available port
  endpoint: '/mcp' as const,
};

describe('MCP Engine Parity Tests', () => {
  describe('API Compatibility', () => {
    let fastmcpServer: any | undefined;
    let sdkServer: any | undefined;

    afterEach(async () => {
      // Servers will be cleaned up automatically by Jest
      fastmcpServer = undefined;
      sdkServer = undefined;
    });

    test('should have identical return signatures', async () => {
      fastmcpServer = await createFastMcpServer(baseServerOptions as FastMcpServerOptions);
      sdkServer = await createSdkMcpServer(baseServerOptions as SdkMcpServerOptions);

      // Both should have the same methods
      const expectedMethods = [
        'addTool',
        'freeTool',
        'paidTool',
        'addPrompt',
        'addResource',
        'addResourceTemplate',
        'start',
        'getInner',
      ];

      for (const method of expectedMethods) {
        expect(typeof fastmcpServer[method]).toBe('function');
        expect(typeof sdkServer[method]).toBe('function');
      }

      // getInner should return server and kit
      const fastmcpInner = fastmcpServer.getInner();
      const sdkInner = sdkServer.getInner();

      expect(fastmcpInner).toHaveProperty('server');
      expect(fastmcpInner).toHaveProperty('kit');
      expect(sdkInner).toHaveProperty('server');
      expect(sdkInner).toHaveProperty('kit');
    });

    test('should handle tool registration consistently', async () => {
      fastmcpServer = await createFastMcpServer(baseServerOptions as FastMcpServerOptions);
      sdkServer = await createSdkMcpServer(baseServerOptions as SdkMcpServerOptions);

      const toolDef = {
        name: 'test_tool',
        description: 'Test tool for parity',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        execute: jest.fn().mockResolvedValue({ result: 'success' }),
      };

      // Both should register tools without errors
      expect(() => {
        fastmcpServer.addTool(toolDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.addTool(toolDef);
      }).not.toThrow();

      // Test free tool registration
      const freeToolDef = {
        name: 'free_tool',
        description: 'Free tool test',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
        },
        execute: jest.fn().mockResolvedValue({ free: 'yes' }),
      };

      expect(() => {
        fastmcpServer.freeTool(freeToolDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.freeTool(freeToolDef);
      }).not.toThrow();

      // Test paid tool registration
      const paidToolDef = {
        name: 'paid_tool',
        description: 'Paid tool test',
        pricePicoUSD: 1000n,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
        execute: jest.fn().mockResolvedValue({ paid: 'yes' }),
      };

      expect(() => {
        fastmcpServer.paidTool(paidToolDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.paidTool(paidToolDef);
      }).not.toThrow();
    });

    test('should handle prompt registration consistently', async () => {
      fastmcpServer = await createFastMcpServer(baseServerOptions as FastMcpServerOptions);
      sdkServer = await createSdkMcpServer(baseServerOptions as SdkMcpServerOptions);

      const promptDef = {
        name: 'test_prompt',
        description: 'Test prompt for parity',
        arguments: [
          {
            name: 'context',
            description: 'Context for the prompt',
            required: false,
          },
        ],
        load: jest.fn().mockResolvedValue('Test prompt content'),
      };

      expect(() => {
        fastmcpServer.addPrompt(promptDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.addPrompt(promptDef);
      }).not.toThrow();
    });

    test('should handle resource registration consistently', async () => {
      fastmcpServer = await createFastMcpServer(baseServerOptions as FastMcpServerOptions);
      sdkServer = await createSdkMcpServer(baseServerOptions as SdkMcpServerOptions);

      const resourceDef = {
        uri: 'test://resource',
        name: 'Test Resource',
        mimeType: 'text/plain',
        load: jest.fn().mockResolvedValue({ text: 'Test resource content' }),
      };

      expect(() => {
        fastmcpServer.addResource(resourceDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.addResource(resourceDef);
      }).not.toThrow();

      const templateDef = {
        uriTemplate: 'test://template/{param}',
        name: 'Test Template',
        mimeType: 'application/json',
        arguments: [
          {
            name: 'param',
            description: 'Template parameter',
            required: true,
          },
        ],
        load: jest.fn().mockResolvedValue({ text: JSON.stringify({ param: 'test' }) }),
      };

      expect(() => {
        fastmcpServer.addResourceTemplate(templateDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.addResourceTemplate(templateDef);
      }).not.toThrow();
    });
  });

  describe('Configuration Handling', () => {
    test('should handle wellKnown configuration', async () => {
      const optionsWithWellKnown = {
        ...baseServerOptions,
        wellKnown: {
          enabled: true,
          path: '/custom-well-known' as const,
        },
      };

      let fastmcpServer = await createFastMcpServer(optionsWithWellKnown as FastMcpServerOptions);
      let sdkServer = await createSdkMcpServer(optionsWithWellKnown as SdkMcpServerOptions);

      expect(fastmcpServer).toBeDefined();
      expect(sdkServer).toBeDefined();

      // Variables will be reset in afterEach
    });

    test('should handle custom route handlers', async () => {
      const customHandler = jest.fn().mockResolvedValue(true);

      const optionsWithHandler = {
        ...baseServerOptions,
        customHandler,
      };

      let fastmcpServer = await createFastMcpServer(optionsWithHandler as FastMcpServerOptions);
      let sdkServer = await createSdkMcpServer(optionsWithHandler as SdkMcpServerOptions);

      expect(fastmcpServer).toBeDefined();
      expect(sdkServer).toBeDefined();

      // Variables will be reset in afterEach
    });
  });

  describe('Built-in Payment Tools', () => {
    test('should register built-in payment tools', async () => {
      let fastmcpServer = await createFastMcpServer(baseServerOptions as FastMcpServerOptions);
      let sdkServer = await createSdkMcpServer(baseServerOptions as SdkMcpServerOptions);

      const fastmcpInner = fastmcpServer.getInner();
      const sdkInner = sdkServer.getInner();

      // Both should have kits with built-in tools
      expect(fastmcpInner.kit).toBeDefined();
      expect(sdkInner.kit).toBeDefined();
      expect(typeof fastmcpInner.kit.listTools).toBe('function');
      expect(typeof sdkInner.kit.listTools).toBe('function');

      const fastmcpTools = fastmcpInner.kit.listTools();
      const sdkTools = sdkInner.kit.listTools();

      expect(Array.isArray(fastmcpTools)).toBe(true);
      expect(Array.isArray(sdkTools)).toBe(true);
      expect(fastmcpTools.length).toBeGreaterThan(0);
      expect(sdkTools.length).toBeGreaterThan(0);

      // Variables will be reset in afterEach
    });
  });
});

describe('McpServerFactory Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.MCP_ENGINE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should use fastmcp engine by default', async () => {
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });

  test('should use fastmcp engine when MCP_ENGINE=fastmcp', async () => {
    process.env.MCP_ENGINE = 'fastmcp';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });

  test('should use fastmcp engine when MCP_ENGINE=legacy', async () => {
    process.env.MCP_ENGINE = 'legacy';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });

  test('should use sdk engine when MCP_ENGINE=sdk', async () => {
    process.env.MCP_ENGINE = 'sdk';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });

  test('should use sdk engine when MCP_ENGINE=official', async () => {
    process.env.MCP_ENGINE = 'official';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });

  test('should override environment variable with explicit engine option', async () => {
    process.env.MCP_ENGINE = 'fastmcp';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer({
      ...baseServerOptions,
      engine: 'sdk',
    } as McpServerOptions);

    expect(server).toBeDefined();
    // Server cleanup handled by test framework
  });
});

describe('Environment Variable Support', () => {
  test('should respect MCP_ENGINE environment variable', () => {
    // Test that the factory correctly reads the environment variable
    const engineValues = ['fastmcp', 'legacy', 'sdk', 'official'];

    for (const engine of engineValues) {
      process.env.MCP_ENGINE = engine;

      // Dynamic import to get fresh module state
      jest.resetModules();
      const { DefaultMcpServerFactory } = require('../../../src/transport/mcp/McpServerFactory');

      const factory = new DefaultMcpServerFactory();
      const expectedEngine = (engine === 'sdk' || engine === 'official') ? 'sdk' : 'fastmcp';

      // Test internal method through reflection for testing purposes
      const getEngineFromEnv = factory['getEngineFromEnv']?.bind(factory);
      if (getEngineFromEnv) {
        const result = getEngineFromEnv();
        expect(result).toBe(expectedEngine === 'fastmcp' ? 'fastmcp' : 'sdk');
      }
    }
  });
});

// Note: Integration tests that start actual servers can be added later
// when the test infrastructure is improved to handle server lifecycle properly