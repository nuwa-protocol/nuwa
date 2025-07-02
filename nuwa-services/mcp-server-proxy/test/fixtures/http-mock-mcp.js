#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import fastify from 'fastify';
import { z } from 'zod';

const server = new McpServer({
  name: 'mock',
  version: '0.1.0',
});

server.tool(
  'echo',
  'Echo',
  { text: z.string() },
  async ({ text }) => ({ content: [{ type: 'text', text }] })
);

server.prompt('hello', async () => ({
  messages: [
    { role: 'user', content: { type: 'text', text: 'Hello, world!' } }
  ]
}));

server.resource(
  'test.txt',
  'file:///test.txt',
  async (uri) => ({
    contents: [{ type: 'text', text: 'file content', uri: 'file:///test.txt' }]
  })
);

const template = new ResourceTemplate('file:///{name}.txt', {
  list: async () => ({
    resources: [
      { name: 'template1', uri: 'file:///template1.txt', mimeType: 'text/plain' }
    ]
  })
});

server.resource(
  'template1',
  template,
  async (uri, variables) => ({
    contents: [{ type: 'text', text: `file content for ${variables.name}`, uri: uri.toString() }]
  })
);

const app = fastify();
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

// Connect the server to the transport only once at startup
(async () => {
  await server.connect(transport);
  console.log('[mock-mcp] MCP server connected to transport');
})();

app.post('/mcp', async (request, reply) => {
  console.log('[mock-mcp] Received POST /mcp');
  try {
    reply.hijack();
    console.log('[mock-mcp] reply.hijack() called');
    await transport.handleRequest(request.raw, reply.raw, request.body);
    console.log('[mock-mcp] handleRequest completed');
    reply.raw.on('close', () => {
      console.log('[mock-mcp] Connection closed');
    });
  } catch (err) {
    console.error('[mock-mcp] Error in /mcp handler:', err);
    reply.status(500).send({ error: 'Internal Server Error', message: err?.message });
  }
});

const port = 4000;
app.listen({ port }, (err, address) => {
  if (err) {
    console.error('[mock-mcp] Server failed to start:', err);
    process.exit(1);
  }
  console.log(`[mock-mcp] Standard MCP HTTP server (SDK, Fastify) running on ${address}`);
}); 