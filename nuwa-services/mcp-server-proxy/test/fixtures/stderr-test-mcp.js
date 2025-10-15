#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Output some debug info to stderr
console.error('[stderr-test-mcp] Starting MCP server...');
console.error('[stderr-test-mcp] Node version:', process.version);
console.error('[stderr-test-mcp] Environment variables count:', Object.keys(process.env).length);

const server = new McpServer({
  name: 'stderr-test-mock',
  version: '0.1.0',
});

// Tool that outputs to both stdout (via MCP) and stderr
server.tool(
  'test_stderr',
  'Test stderr output',
  { message: z.string() },
  async ({ message }) => {
    console.error(`[stderr-test-mcp] Processing tool call with message: ${message}`);
    
    if (message === 'trigger_error') {
      console.error(`[stderr-test-mcp] ERROR: Simulated error condition!`);
      throw new Error('Simulated error for testing');
    }
    
    console.error(`[stderr-test-mcp] Tool execution completed successfully`);
    return { 
      content: [{ 
        type: 'text', 
        text: `Processed: ${message}` 
      }] 
    };
  }
);

const transport = new StdioServerTransport();

// Connect the server to the transport
(async () => {
  try {
    await server.connect(transport);
    console.error('[stderr-test-mcp] MCP stdio server connected and ready');
  } catch (error) {
    console.error('[stderr-test-mcp] Failed to start server:', error);
    process.exit(1);
  }
})();
