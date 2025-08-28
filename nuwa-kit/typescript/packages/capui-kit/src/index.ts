// Legacy API (backward compatibility)
export type { CapUIOptions as LegacyCapUIOptions } from "./cap-ui.js";
export { CapUI as LegacyCapUI } from "./cap-ui.js";

// Modern MCP-based API
export type { CapUIOptions } from "./cap-ui-mcp.js";
export { CapUI } from "./cap-ui-mcp.js";

// Parent API for MCP client
export type { CapUIParentOptions } from "./cap-ui-parent.js";
export { CapUIParent } from "./cap-ui-parent.js";

// Core MCP types and components
export type {
  ChildToolDefinition,
  ParentFunctions,
  AIResponse,
  MCPMessage,
  MCPResponse,
  MCPToolCall,
  MCPToolResult,
  SecurityPolicy,
} from "./mcp/types.js";

// Individual components for advanced usage
export { PostMessageMCPTransport } from "./mcp/transport/postmessage.js";
export { MCPServer } from "./mcp/server.js";
export { MCPClient } from "./mcp/client.js";
export { ChildSDK } from "./child/sdk.js";
export { ParentFunctionHandler } from "./parent/function-handler.js";

// Existing types (backward compatibility)
export type {
	CapUIResource,
	CapUIURI,
} from "./types.js";
export type { UseCapUIParentProps } from "./use-cap-ui.js";

// React Hooks (backward compatibility)
export { useCapUI } from "./use-cap-ui.js";
