export interface StreamAIRequest<T = any> {
	prompt: string;
	capId?: string; // Optional Cap to use for streaming
	schema?: T; // If provided, treat as structured object streaming
	// Optional per-stream callbacks (handled locally; not sent via postMessage)
	onChunk?: (chunk: StreamChunk<T extends any ? string : T>) => void;
	onComplete?: () => void;
	onError?: (error: Error) => void;
}

export type HandleStreamAIRequest = Omit<
	StreamAIRequest<any>,
	"onChunk" | "onComplete" | "onError"
>;

export interface StreamChunk<T = string> {
	type: "content" | "error";
	content?: T;
	error?: Error;
}

export type StreamStatus = "running" | "completed" | "error" | "aborted";

export interface StreamController<T = any> {
	abort(): void;
	getStreamId(): string;
	getStatus(): StreamStatus;
	// If the stream sends string chunks, returns the concatenated string.
	// Otherwise, returns an array of all content chunks.
	getResult(): T extends string ? string : T[];
	getError(): Error | null;
}
