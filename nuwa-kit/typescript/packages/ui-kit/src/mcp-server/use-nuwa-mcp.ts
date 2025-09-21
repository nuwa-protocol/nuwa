import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useEffect } from "react";
import {
	PostMessageMCPTransport,
	type PostMessageMCPTransportOptions,
} from "./mcp-postmessage-transport.js";

export interface UseNuwaMCPOptions {
	transport?: PostMessageMCPTransportOptions;
	debug?: boolean;
}

type GlobalConn = {
	server: McpServer;
	transport: PostMessageMCPTransport;
	refCount: number;
	debug: boolean;
};

let GLOBAL: GlobalConn | null = null;

function acquire(server: McpServer, opts?: UseNuwaMCPOptions): void {
	const debug = !!opts?.debug;
	if (GLOBAL) {
		if (GLOBAL.server === server) {
			GLOBAL.refCount += 1;
			if (debug || GLOBAL.debug)
				console.debug("[useNuwaMCP] Reusing existing MCP connection");
			return;
		}
		// Another server is already connected. We do not support multiple servers per iframe.
		console.warn(
			"[useNuwaMCP] Another McpServer is already connected; ignoring this call. Reuse the same server instance or unmount the other first.",
		);
		return;
	}

	const transport = new PostMessageMCPTransport(opts?.transport);
	GLOBAL = { server, transport, refCount: 1, debug };
	if (debug) console.debug("[useNuwaMCP] Connecting MCP server");
	try {
		server.connect(transport);
	} catch (err) {
		console.error("[useNuwaMCP] MCP connect error", err);
	}
}

function release(server: McpServer, debug?: boolean): void {
	if (!GLOBAL) return;
	if (GLOBAL.server !== server) return; // Not the active one
	GLOBAL.refCount -= 1;
	if (GLOBAL.refCount > 0) return;
	if (debug || GLOBAL.debug) console.debug("[useNuwaMCP] Closing MCP server");
	try {
		GLOBAL.server.close();
	} catch {}
	try {
		GLOBAL.transport.close();
	} catch {}
	GLOBAL = null;
}

/**
 * Minimal hook that connects a provided McpServer with a PostMessage transport
 * on mount and closes it on unmount. Multiple calls with the same server share
 * a single connection (ref-counted). Different server instances are ignored
 * while one is active to prevent transport conflicts.
 */
export function useNuwaMCP(
	server: McpServer,
	options?: UseNuwaMCPOptions,
): void {
	useEffect(() => {
		if (!server) return;
		acquire(server, options);
		return () => release(server, options?.debug);
	}, [server, options]);
}
