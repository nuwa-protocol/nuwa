export interface StreamAIRequest {
	prompt: string;
	capId?: string; // Optional Cap to use for streaming
}

export interface StreamChunk {
	type: "content" | "error";
	content?: string;
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
export interface StreamHandle {
	// Start the stream; resolves when the stream completes or errors/aborts.
	// Optional callbacks allow observing live events without sending them over
	// postMessage. The promise always resolves with both result and error.
	execute(options?: {
		onChunk?: (chunk: StreamChunk) => void;
		onError?: (error: Error) => void;
	}): Promise<{
		result: string;
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
	readonly result: string;
}
