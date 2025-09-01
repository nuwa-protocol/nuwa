// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./mcp-server/mcp-postmessage-transport.js";

// === Nuwa Client (Postmessage Penpal-based) ===
export type {
	NuwaClientOptions,
	// Client Methods
	NuwaClientMethods,
	Selection,
} from "./nuwa-client/nuwa-client.js";
export { NuwaClient } from "./nuwa-client/nuwa-client.js";

// === React Hook for Nuwa Client ===
export { useNuwaClient } from "./nuwa-client/use-nuwa-client.js";

// === Shared Types ===
export { CapUIError, SecurityError, TransportError } from "./types.js";
