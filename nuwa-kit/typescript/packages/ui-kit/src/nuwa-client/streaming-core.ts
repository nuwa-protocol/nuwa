import type {
	StreamAIRequest,
	StreamChunk,
	StreamHandle,
	StreamStatus,
} from "./streaming-types.js";

// Lightweight manager to encapsulate all streaming-related state and logic.
// NuwaClient provides the required dependencies via the constructor.
export class StreamingManager {
	private streamCallbacks = new Map<
		string,
		{
			onChunk?: (chunk: StreamChunk) => void;
			onError?: (error: Error) => void;
		}
	>();
	private streamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	// Track the promise resolver for each stream so we can settle on
	// completion/error/abort/timeout without relying on consumer callbacks.
	private streamExecs = new Map<
		string,
		{
			resolve: (v: { result: any; error: Error | null }) => void;
			settled: boolean;
		}
	>();
	private streamStates = new Map<
		string,
		{
			status: StreamStatus;
			error: Error | null;
			resultText?: string;
			resultArray?: any[];
		}
	>();

	constructor(
		private deps: {
			ensureConnected: () => Promise<void>;
			log: (message: string, data?: any) => void;
			normalizeError: (e: any) => Error;
			getStreamTimeoutMs: () => number;
			startParentStream: (
				wireRequest: StreamAIRequest,
				streamId: string,
			) => Promise<void>;
			abortParentStream: (streamId: string) => void;
		},
	) {}

	// Expose for NuwaClient to wire into Penpal child methods
	pushStreamChunk = (streamId: string, chunk: StreamChunk) => {
		const cbs = this.streamCallbacks.get(streamId);
		const st = this.streamStates.get(streamId);
		// Accumulate results for controller/handle access
		if (st && chunk?.type === "content") {
			const c = (chunk as StreamChunk).content;
			st.resultText = (st.resultText ?? "") + c;
		}
		if (cbs?.onChunk) {
			try {
				cbs.onChunk(chunk);
			} catch (err) {
				this.deps.log("onChunk handler threw", err);
			}
			// Reset per-chunk timeout if configured
			this.resetStreamTimeout(streamId);
		} else if (!cbs) {
			this.deps.log(`No stream callback found for ${streamId}`);
		}
	};

	completeStream = (streamId: string) => {
		const st = this.streamStates.get(streamId);
		if (st) st.status = "completed";
		// Resolve the execute() promise with the final aggregated result
		this.settleStream(streamId, {
			result: this.getAggregatedResult(streamId),
			error: null,
		});
		this.cleanupStream(streamId);
	};

	errorStream = (streamId: string, error: any) => {
		const cbs = this.streamCallbacks.get(streamId);
		const normalized = this.deps.normalizeError(error);
		const st = this.streamStates.get(streamId);
		if (st) {
			st.status = "error";
			st.error = normalized;
		}
		try {
			if (cbs?.onError) {
				cbs.onError(normalized);
			} else if (cbs?.onChunk) {
				// Fallback: surface error as a chunk if consumer didn't supply onError
				cbs.onChunk({ type: "error", error: normalized });
			}
		} catch (err) {
			this.deps.log("onError/onChunk handler threw", err);
		}
		// Always settle the execute() promise on error
		this.settleStream(streamId, {
			result: this.getAggregatedResult(streamId),
			error: normalized,
		});
		this.cleanupStream(streamId);
	};

	// Factory API: create and then execute
	createHandle(request: StreamAIRequest): StreamHandle {
		const streamId = this.generateStreamId();
		this.streamStates.set(streamId, { status: "idle", error: null });

		let executed = false;

		const getAggregatedResult = () => this.getAggregatedResult(streamId);

		const handle: StreamHandle = {
			get id() {
				return streamId;
			},
			get status() {
				return (thisRef.streamStates.get(streamId)?.status ??
					"idle") as StreamStatus;
			},
			get error() {
				return thisRef.streamStates.get(streamId)?.error ?? null;
			},
			get result() {
				return getAggregatedResult();
			},
			abort: () => {
				const st = thisRef.streamStates.get(streamId);
				if (st) {
					st.status = "aborted";
					st.error = new Error("Stream aborted");
				}
				if (executed) {
					try {
						thisRef.deps.abortParentStream(streamId);
					} catch {
						// ignore
					}
				}
				// Settle the execute() promise and then cleanup
				thisRef.settleStream(streamId, {
					result: getAggregatedResult(),
					error: new Error("Stream aborted"),
				});
				thisRef.cleanupStream(streamId);
			},
			execute: async (options?: {
				onChunk?: (chunk: StreamChunk) => void;
				onError?: (error: Error) => void;
			}) => {
				if (executed) {
					return Promise.resolve({
						result: getAggregatedResult(),
						error: thisRef.streamStates.get(streamId)?.error ?? null,
					});
				}
				executed = true;

				await thisRef.deps.ensureConnected();
				const wireRequest = (request as any) || {};

				thisRef.streamStates.set(streamId, { status: "running", error: null });
				thisRef.resetStreamTimeout(streamId);

				const execPromise = new Promise<{ result: any; error: Error | null }>(
					(resolve) => {
						// Store resolver so manager can settle on all terminal states
						thisRef.streamExecs.set(streamId, { resolve, settled: false });
					},
				);

				thisRef.streamCallbacks.set(streamId, {
					onChunk: (chunk: StreamChunk) => {
						try {
							options?.onChunk?.(chunk);
						} catch (err) {
							thisRef.deps.log("onChunk handler threw", err);
						}
						thisRef.resetStreamTimeout(streamId);
					},
					onError: (err: Error) => {
						try {
							options?.onError?.(err);
						} catch (e) {
							thisRef.deps.log("onError handler threw", e);
						}
						// Settle the execute() promise
						thisRef.settleStream(streamId, {
							result: getAggregatedResult(),
							error: err,
						});
					},
				});

				thisRef.deps.log("Starting stream (factory)", {
					streamId,
					request: {
						...(wireRequest as any),
						prompt: (wireRequest.prompt || "").slice(0, 60) + "...",
					},
				});

				try {
					await thisRef.deps.startParentStream(
						wireRequest as StreamAIRequest,
						streamId,
					);
				} catch (err) {
					// If starting the stream fails, surface as an error and settle
					thisRef.errorStream(streamId, err);
				}

				return execPromise;
			},
		};

		const thisRef = this;
		return handle;
	}

	// === Helpers and state management ===
	private getAggregatedResult(streamId: string): any {
		const st = this.streamStates.get(streamId);
		if (!st) return "" as any;
		if (st.resultText !== undefined) return st.resultText as any;
		return (st.resultArray ?? []) as any;
	}

	private generateStreamId(): string {
		try {
			// @ts-ignore - crypto may not exist in all environments but browsers have it
			if (typeof crypto !== "undefined" && crypto.randomUUID) {
				// @ts-ignore
				return crypto.randomUUID();
			}
		} catch {
			// ignore
		}
		return `stream_${Math.random().toString(36).slice(2)}_${Date.now()}`;
	}

	private resetStreamTimeout(streamId: string) {
		const timeoutMs = this.deps.getStreamTimeoutMs();
		const existing = this.streamTimeouts.get(streamId);
		if (existing) clearTimeout(existing);
		if (timeoutMs <= 0) return;
		const t = setTimeout(() => {
			this.deps.log("Stream timeout; aborting", { streamId });
			try {
				this.deps.abortParentStream(streamId);
			} catch {
				// ignore
			}
			const cbs = this.streamCallbacks.get(streamId);
			const st = this.streamStates.get(streamId);
			if (st) {
				st.status = "error";
				st.error = new Error("Stream timed out");
			}
			try {
				if (cbs?.onError) {
					cbs.onError(new Error("Stream timed out"));
				} else if (cbs?.onChunk) {
					cbs.onChunk({ type: "error", error: new Error("Stream timed out") });
				}
			} catch (err) {
				this.deps.log("Timeout handler threw", err);
			}
			// Always settle the execute() promise on timeout
			this.settleStream(streamId, {
				result: this.getAggregatedResult(streamId),
				error: new Error("Stream timed out"),
			});
			this.cleanupStream(streamId);
		}, timeoutMs);
		this.streamTimeouts.set(streamId, t);
	}

	private cleanupStream(streamId: string) {
		const t = this.streamTimeouts.get(streamId);
		if (t) clearTimeout(t);
		this.streamTimeouts.delete(streamId);
		this.streamCallbacks.delete(streamId);
	}

	// Resolve and clear the execute() promise for a stream, idempotently.
	private settleStream(
		streamId: string,
		payload: { result: any; error: Error | null },
	) {
		const exec = this.streamExecs.get(streamId);
		if (!exec || exec.settled) return;
		try {
			exec.settled = true;
			exec.resolve(payload);
		} catch (err) {
			this.deps.log("Failed to resolve execute() promise", err);
		} finally {
			this.streamExecs.delete(streamId);
		}
	}
}
