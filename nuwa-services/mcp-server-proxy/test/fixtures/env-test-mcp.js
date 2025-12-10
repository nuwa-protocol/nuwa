#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'env-test-mock',
  version: '0.1.0',
});

// Tool to test environment variable access
server.tool(
  'check_env',
  'Check environment variables',
  { varName: z.string() },
  async ({ varName }) => {
    const value = process.env[varName];
    return {
      content: [
        {
          type: 'text',
          text: value ? `${varName}=${value}` : `${varName} not found`,
        },
      ],
    };
  }
);

// Tool to list all environment variables (for debugging)
server.tool('list_env', 'List all environment variables', {}, async () => {
  const envVars = Object.keys(process.env).sort();
  return {
    content: [
      {
        type: 'text',
        text: `Found ${envVars.length} environment variables: ${envVars.slice(0, 10).join(', ')}${envVars.length > 10 ? '...' : ''}`,
      },
    ],
  };
});

const transport = new StdioServerTransport();

// Connect the server to the transport
(async () => {
  await server.connect(transport);
  console.error('[env-test-mcp] MCP stdio server connected and ready');
})();
