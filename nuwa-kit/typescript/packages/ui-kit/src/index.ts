// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./mcp-server/mcp-postmessage-transport.js";

// === Nuwa Client (Postmessage Penpal-based) ===
export type {
	ChildConfig,
	NuwaClientOptions,
	ParentConfig,
	// Parent Functions
	ParentFunctions,
	ParentHandler,
} from "./nuwa-client/nuwa-client.js";
export { NuwaClient } from "./nuwa-client/nuwa-client.js";

export type {
	AIResponse,
	// Error Types
	ConnectionEvent,
	ConnectionInfo,
	EventHandler,
	// Configuration Types
	PromptOptions,
	SecurityPolicy,
	StreamingCallback,
	StreamingPromptOptions,
	// Connection and Transport Types
	TransportOptions,
} from "./nuwa-client/types.js";

// === React Hook for Nuwa Client ===
export { useNuwaClient } from "./nuwa-client/use-nuwa-client.js";

// === Shared Types ===
export { CapUIError, SecurityError, TransportError } from "./types.js";
