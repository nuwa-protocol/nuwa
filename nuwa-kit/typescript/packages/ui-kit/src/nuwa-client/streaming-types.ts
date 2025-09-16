export interface StreamAIRequest<T = any> {
	prompt: string;
	capId?: string; // Optional Cap to use for streaming
	schema?: T; // If provided, treat as structured object streaming
}

export interface StreamChunk<T = string> {
	type: "content" | "error";
	content?: T;
	error?: Error;
}

// Lifecycle status of a stream. "idle" indicates a stream handle was created
// but `execute()` has not been called yet.
export type StreamStatus =
	| "idle"
	| "running"
	| "completed"
	| "error"
	| "aborted";

// Factory-style streaming handle. Create via `const s = client.StreamAI(req)`
// then `await s.execute()` to run until completion. Read live status/error and
// abort as needed.
export interface StreamHandle<T = any> {
	// Start the stream; resolves when the stream completes or errors/aborts.
	// Optional callbacks allow observing live events without sending them over
	// postMessage. The promise always resolves with both result and error.
	execute(options?: {
		onChunk?: (chunk: StreamChunk<T extends any ? string : T>) => void;
		onError?: (error: Error) => void;
	}): Promise<{
		result: T extends string ? string : T[];
		error: Error | null;
	}>;
	// Abort the stream (no-op if not yet started).
	abort(): void;
	// Stable identifier for this stream instance.
	readonly id: string;
	// Live state exposed as properties for ergonomic access.
	readonly status: StreamStatus;
	readonly error: Error | null;
	// Aggregated result as of the current moment (final on completion).
	readonly result: T extends string ? string : T[];
}
