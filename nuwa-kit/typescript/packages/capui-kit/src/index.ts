// === Embed UI (Simple Penpal-based) ===
export { CapEmbedUIKit } from "./embed-ui/cap-ui-embed.js";
export { useCapEmbedUIKit } from "./embed-ui/use-cap-ui-embed.js";

// === Artifact UI (MCP-based with official SDK) ===
export { CapUIArtifact } from "./artifact-ui/cap-ui-artifact.js";
export { CapUIParent } from "./artifact-ui/cap-ui-parent.js";

// === MCP Components (Advanced Usage) ===
export { MCPClientWrapper } from "./artifact-ui/mcp-client-wrapper.js";
export { MCPServerWrapper } from "./artifact-ui/mcp-server-wrapper.js";
export { PostMessageMCPTransport } from "./artifact-ui/mcp-postmessage-transport.js";

// === Shared Types ===
export type {
  // Parent Functions (shared by both architectures)
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

// Additional exports for MCP types
export type {
  ToolDefinition,
  ToolCallRequest, 
  ToolCallResponse,
  DiscoveredTool
} from "./artifact-ui/mcp-client-wrapper.js";

export type {
  CapEmbedUIKitOptions
} from "./embed-ui/cap-ui-embed.js";

export type {
  CapUIArtifactOptions  
} from "./artifact-ui/cap-ui-artifact.js";

export type {
  CapUIParentOptions,
  ChildConnection
} from "./artifact-ui/cap-ui-parent.js";

// Legacy exports (for backward compatibility)
/** @deprecated Use CapUIArtifact instead */
export { CapUIArtifact as CapUIMCP } from "./artifact-ui/cap-ui-artifact.js";

/** @deprecated Use CapUIParent instead */
export { CapUIParent as CapUIMCPParent } from "./artifact-ui/cap-ui-parent.js";
