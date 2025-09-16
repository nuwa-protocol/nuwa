export interface StreamAIRequest<T = any> {
	prompt: string;
	capId: string; // Cap to use for streaming
	schema?: T; // If provided, treat as structured object streaming
}

export interface StreamChunk<T = string> {
	type: "content" | "error";
	content?: T;
	error?: Error;
}

export interface StreamController {
	abort(): void;
	getStreamId(): string;
}
