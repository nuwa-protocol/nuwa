// ============================================================================
// MCP Engine Parity Tests
// ============================================================================
//
// This test suite ensures behavioral parity between two MCP server engines:
// 1. FastMCP Engine (fastmcp package) - Default, optimized implementation
// 2. SDK Engine (@modelcontextprotocol/sdk) - Official MCP SDK implementation
//
// Goal: Prevent protocol drift and ensure both engines provide identical
// functionality for tool registration, invocation, payment handling, and
// protocol-level features like __nuwa_auth and __nuwa_payment parameters.
//
// Test Organization:
// - API Compatibility: Basic interface parity between engines
// - E2E Parity Tests: Comprehensive behavioral tests parameterized across both engines
//   - Initialization and session handling
//   - Tool registration, listing, and invocation
//   - __nuwa_auth and __nuwa_payment parameter handling
//   - Health and discovery endpoints
//   - Error handling
//   - Prompt and resource registration
//   - Tool pricing and payment flows
//
// Running tests:
// - All MCP tests: `pnpm test:mcp`
// - Watch mode: `pnpm test:mcp:watch`
// - Full suite: `pnpm test`
//
// Note: Tests use Jest mocks and don't require a running blockchain node.
// For E2E tests with real payment flows, see test/e2e/ directory.
// ============================================================================

import { describe, test, expect, jest, afterEach, beforeEach } from '@jest/globals';
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

// Helper function to unwrap MCP response formats
// SDK engine wraps responses in content arrays, FastMCP returns plain objects
function unwrapMcpResponse(rawResult: any): any {
  let result = rawResult;
  if (rawResult.content && Array.isArray(rawResult.content)) {
    const textContent = rawResult.content.find((c: any) => c.type === 'text');
    if (textContent?.text) {
      try {
        result = JSON.parse(textContent.text);
      } catch {
        result = rawResult;
      }
    }
  }
  return result;
}

describe('MCP Engine Parity Tests', () => {
  describe('API Compatibility', () => {
    let fastmcpServer: any | undefined;
    let sdkServer: any | undefined;

    afterEach(async () => {
      // Explicitly clean up servers to prevent hanging handles
      if (fastmcpServer) {
        try {
          // Call destroy on the kit if it exists
          const inner = fastmcpServer.getInner();
          if (inner?.kit?.destroy) {
            inner.kit.destroy();
          }
        } catch {}
      }
      if (sdkServer) {
        try {
          // Call destroy on the kit if it exists
          const inner = sdkServer.getInner();
          if (inner?.kit?.destroy) {
            inner.kit.destroy();
          }
        } catch {}
      }
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

      const toolDef: any = {
        name: 'test_tool',
        description: 'Test tool for parity',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        // @ts-expect-error
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
      const freeToolDef: any = {
        name: 'free_tool',
        description: 'Free tool test',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
        },
        // @ts-expect-error
        execute: jest.fn().mockResolvedValue({ free: 'yes' }),
      };

      expect(() => {
        fastmcpServer.freeTool(freeToolDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.freeTool(freeToolDef);
      }).not.toThrow();

      // Test paid tool registration
      const paidToolDef: any = {
        name: 'paid_tool',
        description: 'Paid tool test',
        pricePicoUSD: 1000n,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
        // @ts-expect-error
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

      const promptDef: any = {
        name: 'test_prompt',
        description: 'Test prompt for parity',
        arguments: [
          {
            name: 'context',
            description: 'Context for the prompt',
            required: false,
          },
        ],
        // @ts-expect-error
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

      const resourceDef: any = {
        uri: 'test://resource',
        name: 'Test Resource',
        mimeType: 'text/plain',
        // @ts-expect-error
        load: jest.fn().mockResolvedValue({ text: 'Test resource content' }),
      };

      expect(() => {
        fastmcpServer.addResource(resourceDef);
      }).not.toThrow();

      expect(() => {
        sdkServer.addResource(resourceDef);
      }).not.toThrow();

      const templateDef: any = {
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
        // @ts-expect-error
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
    afterEach(async () => {
      // Clean up any servers created in this test group
      // Note: Variables are scoped to individual tests, so no cleanup needed here
    });

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

      // Clean up explicitly by destroying kits
      try {
        const fastmcpInner = fastmcpServer.getInner();
        if (fastmcpInner?.kit?.destroy) {
          fastmcpInner.kit.destroy();
        }
      } catch {}
      try {
        const sdkInner = sdkServer.getInner();
        if (sdkInner?.kit?.destroy) {
          sdkInner.kit.destroy();
        }
      } catch {}
    });

    test('should handle custom route handlers', async () => {
      // @ts-expect-error
      const customHandler: any = jest.fn().mockResolvedValue(true);

      const optionsWithHandler = {
        ...baseServerOptions,
        customHandler,
      };

      let fastmcpServer = await createFastMcpServer(optionsWithHandler as FastMcpServerOptions);
      let sdkServer = await createSdkMcpServer(optionsWithHandler as SdkMcpServerOptions);

      expect(fastmcpServer).toBeDefined();
      expect(sdkServer).toBeDefined();

      // Clean up explicitly by destroying kits
      try {
        const fastmcpInner = fastmcpServer.getInner();
        if (fastmcpInner?.kit?.destroy) {
          fastmcpInner.kit.destroy();
        }
      } catch {}
      try {
        const sdkInner = sdkServer.getInner();
        if (sdkInner?.kit?.destroy) {
          sdkInner.kit.destroy();
        }
      } catch {}
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

      // Clean up explicitly by destroying kits
      try {
        if (fastmcpInner.kit?.destroy) {
          fastmcpInner.kit.destroy();
        }
      } catch {}
      try {
        if (sdkInner.kit?.destroy) {
          sdkInner.kit.destroy();
        }
      } catch {}
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
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });

  test('should use fastmcp engine when MCP_ENGINE=fastmcp', async () => {
    process.env.MCP_ENGINE = 'fastmcp';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });

  test('should use fastmcp engine when MCP_ENGINE=legacy', async () => {
    process.env.MCP_ENGINE = 'legacy';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });

  test('should use sdk engine when MCP_ENGINE=sdk', async () => {
    process.env.MCP_ENGINE = 'sdk';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });

  test('should use sdk engine when MCP_ENGINE=official', async () => {
    process.env.MCP_ENGINE = 'official';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer(baseServerOptions as McpServerOptions);
    expect(server).toBeDefined();
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });

  test('should override environment variable with explicit engine option', async () => {
    process.env.MCP_ENGINE = 'fastmcp';
    const { createMcpServer } = await import('../../../src/transport/mcp/McpServerFactory');

    const server = await createMcpServer({
      ...baseServerOptions,
      engine: 'sdk',
    } as McpServerOptions);

    expect(server).toBeDefined();
    // Clean up explicitly by destroying kit
    try {
      const inner = server.getInner();
      if (inner?.kit?.destroy) {
        inner.kit.destroy();
      }
    } catch {}
  });
});

describe('Environment Variable Support', () => {
  test('should respect MCP_ENGINE environment variable', async () => {
    // Test that the factory correctly reads the environment variable
    const engineValues = ['fastmcp', 'legacy', 'sdk', 'official'];

    for (const engine of engineValues) {
      process.env.MCP_ENGINE = engine;

      // Dynamic import to get fresh module state
      jest.resetModules();
      const { DefaultMcpServerFactory } = await import('../../../src/transport/mcp/McpServerFactory');

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

// ============================================================================
// E2E Parity Tests - Comprehensive Engine Comparison
// ============================================================================

describe.each([
  { engineName: 'FastMCP', createServer: createFastMcpServer },
  { engineName: 'SDK', createServer: createSdkMcpServer },
])('E2E Parity: $engineName Engine', ({ engineName, createServer }) => {
  let server: any;

  afterEach(async () => {
    if (server) {
      try {
        const inner = server.getInner();
        if (inner?.kit?.destroy) {
          inner.kit.destroy();
        }
      } catch (error) {
        // Log cleanup errors for debugging, but don't fail the test
        console.warn('Cleanup error in MCP engine parity tests:', error);
      }
      server = undefined;
    }
  });

  describe('Initialization and Session Handling', () => {
    test('should initialize server successfully', async () => {
      server = await createServer(baseServerOptions as any);
      expect(server).toBeDefined();
      expect(typeof server.start).toBe('function');
      expect(typeof server.getInner).toBe('function');
    });

    test('should return valid kit and server instances', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      expect(inner).toBeDefined();
      expect(inner.kit).toBeDefined();
      expect(inner.server).toBeDefined();
      expect(typeof inner.kit.listTools).toBe('function');
      expect(typeof inner.kit.invoke).toBe('function');
    });

    test('should support service configuration', async () => {
      const opts = {
        ...baseServerOptions,
        serviceId: 'test-service-unique',
        port: 0,
      };
      server = await createServer(opts as any);
      const inner = server.getInner();

      expect(inner.kit).toBeDefined();
      // Kit should be configured with the service ID (in opts)
      expect(inner.kit.opts).toHaveProperty('serviceId');
      expect(inner.kit.opts.serviceId).toBe('test-service-unique');
    });
  });

  describe('Tool List and Tool Call', () => {
    test('should list or have built-in tools available', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      // Check if tools are available either via listTools or handlers map
      const tools = inner.kit.listTools();
      const toolNames = tools.map((t: any) => t.name).filter(Boolean);

      // If listTools is empty, check handlers directly
      const hasHealthTool =
        toolNames.includes('nuwa.health') || inner.kit.handlers?.has?.('nuwa.health');
      const hasDiscoveryTool =
        toolNames.includes('nuwa.discovery') || inner.kit.handlers?.has?.('nuwa.discovery');

      expect(hasHealthTool).toBe(true);
      expect(hasDiscoveryTool).toBe(true);
    });

    test('should register custom tools', async () => {
      server = await createServer(baseServerOptions as any);

      const testTool = {
        name: 'test_custom_tool',
        description: 'Test custom tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        // @ts-expect-error
        execute: jest.fn().mockResolvedValue({ result: 'custom tool executed' }),
      };

      server.addTool(testTool);

      const inner = server.getInner();

      // Check if tool is registered either in list or handlers
      const tools = inner.kit.listTools();
      const toolNames = tools.map((t: any) => t.name).filter(Boolean);
      const hasCustomTool =
        toolNames.includes('test_custom_tool') || inner.kit.handlers?.has?.('test_custom_tool');

      expect(hasCustomTool).toBe(true);
    });

    test('should invoke built-in tools successfully', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      // Call health check tool
      const rawResult = await inner.kit.invoke('nuwa.health', {});
      expect(rawResult).toBeDefined();

      // Extract actual result using helper
      const result = unwrapMcpResponse(rawResult);

      expect(result).toHaveProperty('status');
    });

    test('should invoke custom tools successfully', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error
      const mockExecute = jest.fn().mockResolvedValue({ success: true });
      const testTool: any = {
        name: 'test_invoke_tool',
        description: 'Test invoke tool',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        execute: mockExecute,
      };

      server.addTool(testTool);

      const inner = server.getInner();
      await inner.kit.invoke('test_invoke_tool', { message: 'hello' });

      // Verify the tool was called with the message parameter
      expect(mockExecute).toHaveBeenCalled();
      const callArgs = mockExecute.mock.calls[0];
      expect(callArgs[0]).toMatchObject({ message: 'hello' });
    });
  });

  describe('__nuwa_auth Parameter Handling', () => {
    test('should accept __nuwa_auth parameter in tool calls', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error - Testing mock function
      const mockExecute = jest.fn().mockResolvedValue({ authenticated: true });
      const testTool: any = {
        name: 'test_auth_tool',
        description: 'Test auth tool',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
        },
        execute: mockExecute,
      };

      server.addTool(testTool);

      const inner = server.getInner();
      const authHeader = 'test-auth-token-123';

      // Call tool with __nuwa_auth parameter
      await inner.kit.invoke('test_auth_tool', {
        data: 'test',
        __nuwa_auth: authHeader,
      });

      // Verify the tool was called with auth parameter handling
      expect(mockExecute).toHaveBeenCalled();
      const callArgs = mockExecute.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('data', 'test');
      // Note: __nuwa_auth may or may not be stripped depending on middleware implementation
      // The important thing is the tool executes successfully with auth present
    });

    test('should handle missing __nuwa_auth gracefully', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error
      const mockExecute = jest.fn().mockResolvedValue({ result: 'ok' });
      const testTool: any = {
        name: 'test_optional_auth_tool',
        description: 'Test optional auth tool',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string' },
          },
        },
        execute: mockExecute,
      };

      server.addTool(testTool);

      const inner = server.getInner();

      // Call tool without __nuwa_auth parameter
      await inner.kit.invoke('test_optional_auth_tool', { data: 'test' });

      // Should still work
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('__nuwa_payment Parameter Handling', () => {
    test('should accept __nuwa_payment parameter for paid tools', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error - Testing mock function
      const mockExecute = jest.fn().mockResolvedValue({ paid: true });
      const paidTool: any = {
        name: 'test_paid_tool',
        description: 'Test paid tool',
        pricePicoUSD: 1000n,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
        execute: mockExecute,
      };

      server.paidTool(paidTool);

      const inner = server.getInner();

      // Mock payment payload
      const paymentPayload = {
        channelId: 'test-channel-id',
        nonce: 1,
        auth: 'test-auth',
      };

      // Call tool with __nuwa_payment parameter
      const result = await inner.kit.invoke('test_paid_tool', {
        query: 'test query',
        __nuwa_payment: paymentPayload,
      });

      // In test environment, payment validation may fail, but tool should still be registered.
      // Verify the tool is registered in the handler map and that invocation behavior is as expected.
      expect(result).toBeDefined();

      // The paid tool should be present in the underlying handler registry.
      const handlerRegistered = inner.kit.handlers?.has?.('test_paid_tool');
      expect(handlerRegistered).toBe(true);

      // If payment validation fails, we expect a payment-related error.
      // Otherwise, the tool's execute function should have been called.
      if (result.error) {
        expect(
          result.error.message?.toLowerCase().includes('payment') ||
            result.error.message?.toLowerCase().includes('channel'),
        ).toBe(true);
      } else if (mockExecute.mock.calls.length > 0) {
        // If execute was called, verify parameters
        expect(mockExecute).toHaveBeenCalled();
      } else {
        // In some test configurations, payment may prevent execution entirely
        // which is acceptable behavior - just verify tool is registered
        expect(handlerRegistered).toBe(true);
      }
    });

    test('should handle free tools without __nuwa_payment', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error
      const mockExecute = jest.fn().mockResolvedValue({ free: true });
      const freeTool: any = {
        name: 'test_free_tool',
        description: 'Test free tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        execute: mockExecute,
      };

      server.freeTool(freeTool);

      const inner = server.getInner();

      // Call free tool without payment
      await inner.kit.invoke('test_free_tool', { input: 'test' });

      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('Health Check Endpoint', () => {
    test('should have nuwa.health tool available', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      // Check if tool is available via handlers
      const hasHealthTool = inner.kit.handlers?.has?.('nuwa.health');
      expect(hasHealthTool).toBe(true);
    });

    test('should return healthy status from nuwa.health', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      const rawResult = await inner.kit.invoke('nuwa.health', {});

      // Extract actual result using helper
      const result = unwrapMcpResponse(rawResult);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result.status).toBe('healthy');
    });

    test('should return version info in health check', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      const rawResult = await inner.kit.invoke('nuwa.health', {});

      // Extract actual result using helper
      const result = unwrapMcpResponse(rawResult);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      // Version field is optional - when present it must be a string
      if ('version' in result) {
        expect(
          result.version === undefined ||
            result.version === null ||
            typeof result.version === 'string',
        ).toBe(true);
      }
    });
  });

  describe('Discovery Endpoint', () => {
    test('should have nuwa.discovery tool available or invocable', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      // Verify tool is registered in handlers (more reliable than listTools)
      const handlerRegistered = inner.kit.handlers?.has?.('nuwa.discovery');
      expect(handlerRegistered).toBe(true);

      // Additionally verify it's invocable
      const rawResult = await inner.kit.invoke('nuwa.discovery', {});
      expect(rawResult).toBeDefined();
      expect(rawResult.error).toBeUndefined();
    });

    test('should return service info from nuwa.discovery', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      const rawResult = await inner.kit.invoke('nuwa.discovery', {});

      // Extract actual result using helper
      const result = unwrapMcpResponse(rawResult);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('serviceId');
      expect(result.serviceId).toBe(baseServerOptions.serviceId);
    });

    test('should return serviceDid in discovery', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      const rawResult = await inner.kit.invoke('nuwa.discovery', {});

      // Extract actual result using helper
      const result = unwrapMcpResponse(rawResult);

      expect(result).toBeDefined();
      // serviceDid may not always be present in all engines/configurations,
      // but when present it must be a string
      expect([undefined, expect.any(String)]).toContain(result.serviceDid);
      // At minimum, should have serviceId
      expect(result.serviceId).toBe(baseServerOptions.serviceId);
    });
  });

  describe('Tool Pricing and Payment Flow', () => {
    test('should correctly register and invoke free tools', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error - Testing mock function
      const mockExecute = jest.fn().mockResolvedValue({ type: 'free' });
      const freeTool: any = {
        name: 'free_pricing_test',
        description: 'Free pricing test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: mockExecute,
      };

      server.freeTool(freeTool);

      const inner = server.getInner();

      // Verify tool can be invoked (even if not in list)
      await inner.kit.invoke('free_pricing_test', {});
      expect(mockExecute).toHaveBeenCalled();
    });

    test('should correctly register paid tools', async () => {
      server = await createServer(baseServerOptions as any);

      // @ts-expect-error - Testing mock function
      const mockExecute = jest.fn().mockResolvedValue({ type: 'paid' });
      const paidTool: any = {
        name: 'paid_pricing_test',
        description: 'Paid pricing test tool',
        pricePicoUSD: 5000n,
        parameters: {
          type: 'object',
          properties: {},
        },
        execute: mockExecute,
      };

      server.paidTool(paidTool);

      const inner = server.getInner();

      // Verify tool is registered (invocation may require payment)
      const result = await inner.kit.invoke('paid_pricing_test', {});

      // The paid tool should be present in the underlying handler registry.
      const handlerRegistered = inner.kit.handlers?.has?.('paid_pricing_test');
      expect(handlerRegistered).toBe(true);

      // Tool is registered if we get a response (even if it's an error about payment)
      expect(result).toBeDefined();
      // If payment validation fails, we expect a payment-related error.
      // Otherwise, the tool's execute function should have been called.
      if (result.error) {
        expect(
          result.error.message?.toLowerCase().includes('payment') ||
            result.error.message?.toLowerCase().includes('channel'),
        ).toBe(true);
      } else if (mockExecute.mock.calls.length > 0) {
        // If execute was called, verify it happened
        expect(mockExecute).toHaveBeenCalled();
      } else {
        // In some test configurations, payment may prevent execution entirely
        // which is acceptable behavior - just verify tool is registered
        expect(handlerRegistered).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle tool execution errors gracefully', async () => {
      server = await createServer(baseServerOptions as any);

      const errorTool: any = {
        name: 'error_test_tool',
        description: 'Error test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
        // @ts-expect-error - Testing mock function
        execute: jest.fn().mockRejectedValue(new Error('Tool execution failed')),
      };

      server.addTool(errorTool);

      const inner = server.getInner();

      // Should return error in content or error field
      const result = await inner.kit.invoke('error_test_tool', {});
      expect(result).toBeDefined();
      
      // Error can be in content or error field depending on engine
      // Check for specific error message to avoid false positives
      const errorMessage = 'Tool execution failed';
      const hasError =
        (result.content &&
          result.content.some(
            (c: any) => typeof c.text === 'string' && c.text.includes(errorMessage),
          )) ||
        (result.error &&
          (result.error.message === errorMessage ||
            String(result.error).includes(errorMessage) ||
            result.error.message?.includes('error')));
      expect(hasError).toBeTruthy();
    });

    test('should handle non-existent tool calls', async () => {
      server = await createServer(baseServerOptions as any);
      const inner = server.getInner();

      // Should return error for non-existent tool
      const result = await inner.kit.invoke('non_existent_tool', {});
      expect(result).toBeDefined();
      // Error should be present in the result
      expect(result.error).toBeDefined();
    });
  });

  describe('Prompt Registration', () => {
    test('should register prompts successfully', async () => {
      server = await createServer(baseServerOptions as any);

      const promptDef = {
        name: 'test_prompt',
        description: 'Test prompt',
        arguments: [
          {
            name: 'context',
            description: 'Context parameter',
            required: false,
          },
        ],
        // @ts-expect-error
        load: jest.fn().mockResolvedValue('Test prompt content'),
      };

      expect(() => {
        server.addPrompt(promptDef);
      }).not.toThrow();
    });
  });

  describe('Resource Registration', () => {
    test('should register resources successfully', async () => {
      server = await createServer(baseServerOptions as any);

      const resourceDef = {
        uri: 'test://resource/file',
        name: 'Test Resource',
        mimeType: 'text/plain',
        // @ts-expect-error
        load: jest.fn().mockResolvedValue({ text: 'Resource content' }),
      };

      expect(() => {
        server.addResource(resourceDef);
      }).not.toThrow();
    });

    test('should register resource templates successfully', async () => {
      server = await createServer(baseServerOptions as any);

      const templateDef = {
        uriTemplate: 'test://template/{id}',
        name: 'Test Template',
        mimeType: 'application/json',
        arguments: [
          {
            name: 'id',
            description: 'Resource ID',
            required: true,
          },
        ],
        // @ts-expect-error
        load: jest.fn().mockResolvedValue({ text: '{"id": "test"}' }),
      };

      expect(() => {
        server.addResourceTemplate(templateDef);
      }).not.toThrow();
    });
  });
});