// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./mcp-server/mcp-postmessage-transport.js";

// === Nuwa Client (Postmessage Penpal-based) ===
export type {
	// Client Methods
	NuwaClientMethods,
	NuwaClientOptions,
	Selection,
} from "./nuwa-client/nuwa-client.js";
export {
	NUWA_CLIENT_TIMEOUT,
	NUWA_METHOD_TIMEOUT,
	NuwaClient,
} from "./nuwa-client/nuwa-client.js";

// === React Hook for Nuwa Client ===
export { useNuwaClient } from "./nuwa-client/use-nuwa-client.js";

// === Shared Types ===
export { CapUIError, SecurityError, TransportError } from "./types.js";
