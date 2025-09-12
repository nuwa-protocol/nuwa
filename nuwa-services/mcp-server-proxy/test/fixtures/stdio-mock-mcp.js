#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'stdio-mock',
  version: '0.1.0',
});

server.tool(
  'echo',
  'Echo',
  { text: z.string() },
  async ({ text }) => ({ content: [{ type: 'text', text }] })
);

server.tool(
  'stdio.free',
  'A free stdio tool',
  { message: z.string() },
  async ({ message }) => ({ content: [{ type: 'text', text: `Stdio free tool executed with message: ${message}` }] })
);

server.tool(
  'stdio.paid',
  'A paid stdio tool',
  { data: z.string() },
  async ({ data }) => ({ content: [{ type: 'text', text: `Stdio paid tool executed with data: ${data}` }] })
);

server.prompt('hello', async () => ({
  messages: [
    { role: 'user', content: { type: 'text', text: 'Hello from stdio!' } }
  ]
}));

server.resource(
  'stdio-test.txt',
  'file:///stdio-test.txt',
  async (uri) => ({
    contents: [{ type: 'text', text: 'stdio file content', uri: 'file:///stdio-test.txt' }]
  })
);

const transport = new StdioServerTransport();

// Connect the server to the transport
(async () => {
  await server.connect(transport);
  console.error('[stdio-mock-mcp] MCP stdio server connected and ready');
})();