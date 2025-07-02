#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

// Register a prompt with a callback returning the expected message
server.prompt('hello', async () => ({
  messages: [
    { role: 'user', content: { type: 'text', text: 'Hello, world!' } }
  ]
}));

// Register a static resource
server.resource(
  'test.txt',
  'file:///test.txt',
  async (uri) => ({
    contents: [{ type: 'text', text: 'file content', uri: 'file:///test.txt' }]
  })
);

// Register a resource template using ResourceTemplate
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => { console.error(e); process.exit(1); }); 