// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./mcp-server/mcp-postmessage-transport.js";
export type {
	UIResource,
	UIToolResult,
} from "./mcp-server/types.js";
// === Shared Types ===
export {
	CapUIError,
	createUIResource,
	createUIToolResult,
	SecurityError,
	TransportError,
} from "./mcp-server/types.js";
// === Nuwa Client (Postmessage Penpal-based) ===
export type {
	// Client Methods
	NuwaClientMethods,
	NuwaClientOptions,
	Selection,
} from "./nuwa-client/nuwa-client.js";
export {
	NUWA_CLIENT_TIMEOUT,
	NuwaClient,
} from "./nuwa-client/nuwa-client.js";
export type { HandleStreamAIRequest } from "./nuwa-client/streaming-types.js";
// === React Hook for Nuwa Client ===
export { useNuwaClient } from "./nuwa-client/use-nuwa-client.js";
