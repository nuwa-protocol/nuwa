// === MCP Transport (Use with official @modelcontextprotocol/sdk) ===
export { PostMessageMCPTransport } from "./mcp-server/mcp-postmessage-transport";
// === Shared Types ===
export {
	CapUIError,
	SecurityError,
	TransportError,
} from "./mcp-server/types";
// === MCP UI Resource Types and Helper ===
export type { UIResource } from "./mcp-server/ui-resource";
export {
	createUIResource,
	isUIResource,
} from "./mcp-server/ui-resource";
export type { UseNuwaMCPOptions } from "./mcp-server/use-nuwa-mcp";
// === React Hook for MCP server lifecycle ===
export { useNuwaMCP } from "./mcp-server/use-nuwa-mcp";

// === Nuwa Client (Postmessage Penpal-based) ===
export type {
	// Client Methods
	NuwaClientMethods,
	NuwaClientOptions,
	Selection,
} from "./nuwa-client/nuwa-client";
export {
	NUWA_CLIENT_TIMEOUT,
	NuwaClient,
} from "./nuwa-client/nuwa-client";

// === React Hook for Nuwa Client ===
export {
	NuwaProvider,
	useNuwa,
} from "./nuwa-client/nuwa-context";
export type {
	StreamAIRequest,
	StreamChunk,
	StreamHandle,
} from "./nuwa-client/streaming-types";
