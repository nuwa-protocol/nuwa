// === Embed UI (Simple Penpal-based) ===
export { CapEmbedUIKit } from "./embed-ui/cap-ui-embed.js";
export { useCapEmbedUIKit } from "./embed-ui/use-cap-ui-embed.js";

// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./artifact-ui/mcp-postmessage-transport.js";

// === Shared Types ===
export type {
  // Parent Functions (for embed-ui architecture)
  ParentFunctions,
  ParentHandler,
  AIResponse,
  PromptOptions,
  StreamingPromptOptions,
  StreamingCallback,
  
  // Configuration Types
  ParentConfig,
  ChildConfig,
  
  // Connection and Transport Types
  TransportOptions,
  ConnectionInfo,
  SecurityPolicy,
  ConnectionEvent,
  EventHandler,
  
  // Error Types
  CapUIError,
  TransportError,
  SecurityError,
} from "./shared/types.js";

export type {
  CapEmbedUIKitOptions
} from "./embed-ui/cap-ui-embed.js";
