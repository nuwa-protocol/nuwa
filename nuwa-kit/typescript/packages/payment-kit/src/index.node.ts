// Node bundle entry: export isomorphic modules + Node-only modules

// Isomorphic exports
export * from './index.browser';

// Node-only: Express transport & API handlers
export * from './transport/express';
export * from './api';

// Node-only: SQL storage aggregator (provided via subpath as well)
export * from './storage/sql';

// Node-only: MCP server/client (FastMCP adapter lazily loads ai/sdk at runtime)
export * from './transport/mcp/McpPaymentKit';
export * from './transport/mcp/FastMcpStarter';
export * from './transport/mcp/McpServerFactory';

// Explicit re-exports to ensure they're available in main package
export { createMcpServer, createMcpServerFromEnv, McpServerFactory } from './transport/mcp/McpServerFactory';
// Note: MCP client exports are already included via ./index.browser -> ./integrations/mcp
