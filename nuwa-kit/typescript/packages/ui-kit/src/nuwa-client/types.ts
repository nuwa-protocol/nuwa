// Shared types for both embed-ui and artifact-ui architectures
export interface AIResponse {
	content: string;
	streaming?: boolean;
	model?: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface StreamingAIResponse {
	id: string;
	type:
		| "streaming_start"
		| "streaming_chunk"
		| "streaming_end"
		| "streaming_error";
	content?: string;
	model?: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	error?: string;
	metadata?: any;
}

export type StreamingCallback = (response: StreamingAIResponse) => void;

export interface PromptOptions {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	streaming?: boolean;
}

export interface StreamingPromptOptions extends PromptOptions {
	streaming: true;
	onChunk?: StreamingCallback;
	onComplete?: (finalResponse: AIResponse) => void;
	onError?: (error: string) => void;
}

// Connection and transport types
export interface TransportOptions {
	targetOrigin?: string;
	allowedOrigins?: string[];
	timeout?: number;
	debug?: boolean;
}

export interface ConnectionInfo {
	name: string;
	version: string;
	capabilities?: string[];
}

// Security types
export interface SecurityPolicy {
	allowedOrigins: string[];
	rateLimits?: {
		windowMs: number;
		maxRequests: number;
	}[];
	messageValidation?: {
		enforceSchema: boolean;
		sanitizeInputs: boolean;
		maxMessageSize: number;
	};
}

// Event types
export interface ConnectionEvent {
	type: "connected" | "disconnected" | "error" | "message";
	data?: any;
}

export type EventHandler = (event: ConnectionEvent) => void;
