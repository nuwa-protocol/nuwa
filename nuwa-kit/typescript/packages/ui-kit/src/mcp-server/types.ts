// Error types
export class CapUIError extends Error {
	constructor(
		message: string,
		public code?: string,
		public origin?: string,
	) {
		super(message);
		this.name = "CapUIError";
	}
}

export class TransportError extends CapUIError {
	constructor(message: string, code?: string) {
		super(message, code);
		this.name = "TransportError";
	}
}

export class SecurityError extends CapUIError {
	constructor(message: string, origin?: string) {
		super(message, "SECURITY_ERROR", origin);
		this.name = "SecurityError";
	}
}

// UI Resource Types for MCP Tool Results

/**
 * MCP Resource for UI rendering via path
 * The client will use the path to construct the full URL with its known origin
 */
export interface UIResource {
	uri: string;
	name: string;
	description?: string;
	mimeType: "text/x-nuwa-capui-path";
	text: string; // Must start with '/'
	annotations?: {
		uiType?: "inline" | "artifact";
	};
}

/**
 * Complete MCP Tool Result with UI Resource
 * This is what gets returned from MCP tool calls when showing UI
 */
export interface UIToolResult {
	content: Array<{
		type: "resource";
		resource: UIResource;
	}>;
	isError?: boolean;
}

/**
 * Helper function to create a UI resource
 */
export function createUIResource(
	path: string,
	name?: string,
	description?: string,
	uiType: "inline" | "artifact" = "inline",
): UIResource {
	// Ensure path starts with '/'
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	return {
		uri: `capui:/${normalizedPath}`,
		name: name || "Cap UI",
		description,
		mimeType: "text/x-nuwa-capui-path",
		text: normalizedPath,
		annotations: {
			uiType,
		},
	};
}

/**
 * Helper function to create a complete UI tool result
 */
export function createUIToolResult(
	path: string,
	name?: string,
	description?: string,
	uiType: "inline" | "artifact" = "inline",
): UIToolResult {
	const resource = createUIResource(path, name, description, uiType);

	return {
		content: [
			{
				type: "resource",
				resource,
			},
		],
		isError: false,
	};
}
