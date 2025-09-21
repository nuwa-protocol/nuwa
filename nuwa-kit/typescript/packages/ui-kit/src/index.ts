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
// === React Hook for Nuwa Client ===
export {
	NuwaProvider,
	useNuwa,
} from "./nuwa-client/nuwa-context.js";
export type {
	StreamAIRequest,
	StreamChunk,
	StreamHandle,
} from "./nuwa-client/streaming-types.js";
// === React Hook for MCP server lifecycle ===
export { useNuwaMCP } from "./mcp-server/use-nuwa-mcp.js";
export type { UseNuwaMCPOptions } from "./mcp-server/use-nuwa-mcp.js";
