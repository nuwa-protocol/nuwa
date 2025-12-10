#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 这些会输出到 stderr，在代理中可见
console.error('[demo-mcp] Starting MCP server...');
console.error('[demo-mcp] This is stderr output - visible in proxy console');

// 这些会输出到 stdout，会干扰 MCP 协议！
// console.log('This would break MCP protocol!'); // ❌ 不要这样做

const server = new McpServer({
  name: 'stdio-demo',
  version: '0.1.0',
});

server.tool(
  'demo_stdio',
  'Demonstrate stdio vs stderr',
  { message: z.string() },
  async ({ message }) => {
    // 调试信息输出到 stderr（推荐）
    console.error(`[demo-mcp] Processing: ${message}`);

    // MCP 响应通过 SDK 发送到 stdout（自动处理）
    return {
      content: [
        {
          type: 'text',
          text: `Demo response: ${message}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();

(async () => {
  try {
    await server.connect(transport);
    console.error('[demo-mcp] MCP server ready - stderr output visible');
  } catch (error) {
    console.error('[demo-mcp] Startup error:', error);
    process.exit(1);
  }
})();
