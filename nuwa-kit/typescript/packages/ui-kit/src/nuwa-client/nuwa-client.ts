import {
	CallOptions,
	connect,
	debug,
	type RemoteProxy,
	type Reply,
	WindowMessenger,
} from "penpal";
import type {
	HandleStreamAIRequest,
	StreamAIRequest,
	StreamChunk,
	StreamController,
	StreamStatus,
} from "./streaming-types.js";

// Default timeout for Penpal connections
export const NUWA_CLIENT_TIMEOUT = 2000;

// Default timeout for method calls
export const NUWA_METHOD_TIMEOUT = 2000;

// Per-method default timeouts (can be overridden via options)
export const NUWA_SEND_PROMPT_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_SET_HEIGHT_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_ADD_SELECTION_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_SAVE_STATE_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_GET_STATE_TIMEOUT = 3000;
// Streaming defaults
export const NUWA_STREAM_TIMEOUT = 30000;
export const NUWA_STREAM_RETRIES = 0;

// Retry defaults
export const NUWA_METHOD_RETRIES = 0;
export const NUWA_SEND_PROMPT_RETRIES = NUWA_METHOD_RETRIES;
export const NUWA_SET_HEIGHT_RETRIES = NUWA_METHOD_RETRIES;
export const NUWA_ADD_SELECTION_RETRIES = NUWA_METHOD_RETRIES;
export const NUWA_SAVE_STATE_RETRIES = NUWA_METHOD_RETRIES;
export const NUWA_GET_STATE_RETRIES = 3;

// Re-export Penpal error codes for client use
export { ErrorCode } from "penpal";

// Types for selection functionality
export interface Selection {
	name: string;
	message: string | Record<string, any>;
}

/**
 * Interface for Nuwa client methods that can be called by child iframes
 */
export interface NuwaClientMethods {
	/**
	 * Send a prompt to the AI backend
	 * @param prompt The prompt text to send
	 * @returns Promise resolving when prompt is sent
	 */
	sendPrompt(prompt: string): Promise<void>;

	/**
	 * Set the height of the iframe (convenience method)
	 * @param height Height in pixels or CSS value
	 * @returns Promise resolving when height is set
	 */
	setHeight?(height: string | number): Promise<void>;

	/**
	 * Add a selection to the parent Nuwa client
	 * @param label The label/name for the selection
	 * @param message The message content (string or object)
	 * @returns Promise resolving when selection is sent
	 */
	addSelection(
		label: string,
		message: string | Record<string, any>,
	): Promise<void>;

	/**
	 * Save state data to the parent Nuwa client
	 * @param state State data to save
	 * @returns Promise resolving when state is saved
	 */
	saveState<T = any>(state: T): Promise<void>;

	/**
	 * Retrieve state data from the parent Nuwa client
	 * @returns Promise resolving with the saved state
	 */
	getState<T = any>(): Promise<T | null>;

	/**
	 * Start an AI stream and receive chunks from the parent.
	 * If `schema` is provided in request, the stream will be treated as structured.
	 * @param request The stream request
	 * @returns A controller object for managing the stream
	 */
	streamAI<T = any>(request: StreamAIRequest<T>): Promise<StreamController>;
}

// Penpal-specific parent methods interface
// Maps shared NuwaClientMethods to Penpal Reply format
// For streaming, ensure callbacks aren't sent across postMessage.
type PenpalParentMethods = {
	sendPrompt(prompt: string): Reply<void>;
	setHeight(height: string | number): Reply<void>;
	addSelection(
		label: string,
		message: string | Record<string, any>,
	): Reply<void>;
	saveState(state: any): Reply<void>;
	getState(): Reply<any>;
	// Streaming: parent-side handlers invoked by child
	handleStreamRequest(
		request: HandleStreamAIRequest,
		streamId: string,
	): Reply<void>;
	abortStream(streamId: string): Reply<void>;
};

export interface NuwaClientOptions {
	allowedOrigins?: string[];
	timeout?: number;
	debug?: boolean;
	// Global fallback timeout for all method calls
	methodTimeout?: number;
	// Optional per-method timeouts override the global value
	methodTimeouts?: Partial<Record<keyof NuwaClientMethods, number>>;
	// Global fallback retries for all method calls
	methodRetries?: number;
	// Optional per-method retries override the global value
	methodRetriesMap?: Partial<Record<keyof NuwaClientMethods, number>>;

	// Streaming config
	streamTimeout?: number; // default 30s
	streamRetries?: number; // default 0
	streamBufferSize?: number; // default 100
}

/**
 * NuwaClient - Simple iframe communication using Penpal
 * Implements shared NuwaClientMethods interface for consistency
 */
export class NuwaClient implements NuwaClientMethods {
	private parentMethods: RemoteProxy<PenpalParentMethods> | null = null;
	private connectionStatus: boolean = false;
	private connectionPromise: Promise<void> | null = null;
	// Store the underlying Penpal connection to allow proper cleanup
	private penpalConnection: any | null = null;
	private options: NuwaClientOptions;
	// Streaming state: per-stream lifecycle handlers are kept locally in the
	// iframe. They are never sent over postMessage.
	private streamCallbacks = new Map<
		string,
		{
			onChunk?: (chunk: StreamChunk<any>) => void;
			onComplete?: () => void;
			onError?: (error: Error) => void;
		}
	>();
	// Map of streamId -> timeout handle for overall stream timeout.
	private streamTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	// Track per-stream status and accumulated results so controller methods can
	// retrieve them even after streaming completes.
	private streamStates = new Map<
		string,
		{
			status: StreamStatus;
			error: Error | null;
			resultText?: string; // used when content chunks are strings
			resultArray?: any[]; // used for non-string content chunks
		}
	>();

	constructor(options: NuwaClientOptions = {}) {
		this.options = {
			allowedOrigins: ["*"],
			debug: true,
			timeout: NUWA_CLIENT_TIMEOUT,
			...options,
		};

		this.log("NuwaClient initialized", this.options);
	}

	/**
	 * Connect to parent window via Penpal
	 */
	async connect(): Promise<void> {
		// If already connected, nothing to do
		if (this.parentMethods && this.connectionStatus) return;

		// Reuse in-flight connection attempt; reset on failure so we can retry
		if (!this.connectionPromise) {
			this.connectionPromise = this.establishConnection().catch((err) => {
				this.connectionPromise = null; // allow subsequent retries
				throw err;
			});
		}

		// Ensure callers only proceed after successful handshake
		await this.connectionPromise;
	}

	private async establishConnection(): Promise<void> {
		try {
			this.log("Establishing connection to parent");

			// Check if we're in a proper iframe context
			if (window.parent === window) {
				throw new Error(
					"No parent window found - this component must be embedded in an iframe",
				);
			}

			const messenger = new WindowMessenger({
				remoteWindow: window.parent,
				allowedOrigins: this.options.allowedOrigins || ["*"],
			});

			// Expose child methods the parent can call (for streaming)
			const childMethods = {
				// Parent pushes a chunk for a given streamId
				pushStreamChunk: (streamId: string, chunk: StreamChunk<any>) => {
					const cbs = this.streamCallbacks.get(streamId);
					const st = this.streamStates.get(streamId);
					// Accumulate results for controller access
					if (st && chunk?.type === "content") {
						const c = (chunk as StreamChunk<any>).content;
						if (typeof c === "string") {
							st.resultText = (st.resultText ?? "") + c;
						} else if (c !== undefined) {
							st.resultArray = [...(st.resultArray ?? []), c];
						}
					}
					if (cbs?.onChunk) {
						try {
							cbs.onChunk(chunk);
						} catch (err) {
							this.log("onChunk handler threw", err);
						}
						// Reset per-chunk timeout if configured
						this.resetStreamTimeout(streamId);
					} else if (!cbs) {
						this.log(`No stream callback found for ${streamId}`);
					}
				},
				// Parent indicates the stream is complete
				completeStream: (streamId: string) => {
					const cbs = this.streamCallbacks.get(streamId);
					const st = this.streamStates.get(streamId);
					if (st) st.status = "completed";
					try {
						cbs?.onComplete?.();
					} catch (err) {
						this.log("onComplete handler threw", err);
					}
					this.cleanupStream(streamId);
				},
				// Parent indicates the stream errored
				errorStream: (streamId: string, error: any) => {
					const cbs = this.streamCallbacks.get(streamId);
					const normalized = this.normalizeError(error);
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
						this.log("onError/onChunk handler threw", err);
					}
					this.cleanupStream(streamId);
				},
			};

			// Create and keep the connection so we can destroy it on disconnect
			this.penpalConnection = connect<PenpalParentMethods>({
				messenger,
				methods: childMethods,
				log: this.options.debug ? debug("Nuwa Child") : undefined,
			});

			this.parentMethods = await this.penpalConnection.promise;
			this.connectionStatus = true;

			this.log("Connected to parent successfully");
		} catch (error) {
			this.log("Failed to connect to parent", error);
			this.connectionStatus = false;
			throw error;
		}
	}

	// === NuwaClientMethods Implementation ===

	/**
	 * Send prompt to the parent Nuwa Client
	 */
	async sendPrompt(prompt: string): Promise<void> {
		await this.ensureConnected();

		this.log("Sending prompt", {
			prompt: prompt.substring(0, 100) + "...",
		});
		await this.callWithRetry("sendPrompt", async () =>
			this.parentMethods!.sendPrompt(
				prompt,
				new CallOptions({ timeout: this.getTimeout("sendPrompt") }),
			),
		);
	}

	/**
	 * Set the height of the iframe in the parent
	 */
	async setHeight(height: string | number): Promise<void> {
		await this.ensureConnected();

		this.log("Setting height", { height });
		await this.callWithRetry("setHeight", async () =>
			this.parentMethods!.setHeight(
				height,
				new CallOptions({ timeout: this.getTimeout("setHeight") }),
			),
		);
	}

	/**
	 * Add a selection to the parent Nuwa client
	 */
	async addSelection(
		label: string,
		message: string | Record<string, any>,
	): Promise<void> {
		await this.ensureConnected();

		// Convert message to string if it's an object
		const normalizedMessage =
			typeof message === "string" ? message : JSON.stringify(message);

		this.log("Sending selection", { name: label });
		await this.callWithRetry("addSelection", async () =>
			this.parentMethods!.addSelection(
				label,
				normalizedMessage,
				new CallOptions({ timeout: this.getTimeout("addSelection") }),
			),
		);
	}

	/**
	 * Save state data to the parent Nuwa client
	 */
	async saveState<T = any>(state: T): Promise<void> {
		await this.ensureConnected();

		this.log("Saving state", { stateType: typeof state });
		await this.callWithRetry("saveState", async () =>
			this.parentMethods!.saveState(
				state,
				new CallOptions({ timeout: this.getTimeout("saveState") }),
			),
		);
	}

	/**
	 * Retrieve state data from the parent Nuwa client
	 */
	async getState<T = any>(): Promise<T | null> {
		await this.ensureConnected();

		this.log("Getting state");
		return await this.callWithRetry("getState", async () =>
			this.parentMethods!.getState(
				new CallOptions({ timeout: this.getTimeout("getState") }),
			).then((s) => s as T | null),
		);
	}

	/**
	 * Start an AI stream via parent.
	 *
	 * The request may include optional callbacks (onChunk, onComplete, onError).
	 * These callbacks are handled locally and are NOT sent to the parent, since
	 * functions cannot be cloned via postMessage.
	 */
	async streamAI<T = any>(
		request: StreamAIRequest<T>,
	): Promise<StreamController<T>> {
		await this.ensureConnected();

		const streamId = this.generateStreamId();
		// Extract callbacks from request (if present) and register them.
		const { onChunk, onComplete, onError, ...wireRequest } =
			(request as any) || {};
		this.streamCallbacks.set(streamId, {
			onChunk: onChunk as (c: StreamChunk<any>) => void | undefined,
			onComplete,
			onError,
		});
		// Initialize state tracking for this stream
		this.streamStates.set(streamId, {
			status: "running",
			error: null,
		});
		// Set overall stream timeout (auto abort)
		this.resetStreamTimeout(streamId);

		// Log a sanitized copy of the request (avoid logging functions)
		this.log("Starting stream", {
			streamId,
			request: {
				...(wireRequest as any),
				prompt: (wireRequest.prompt || "").slice(0, 60) + "...",
			},
		});

		// Kick off the stream on the parent
		await this.callWithRetry("streamAI", async () =>
			this.parentMethods!.handleStreamRequest(
				wireRequest as Omit<
					StreamAIRequest<any>,
					"onChunk" | "onComplete" | "onError"
				>,
				streamId,
				new CallOptions({ timeout: this.getTimeout("streamAI") }),
			),
		);

		const controller: StreamController<T> = {
			abort: () => {
				// Inform parent and cleanup
				try {
					this.parentMethods?.abortStream(
						streamId,
						new CallOptions({ timeout: this.getTimeout("streamAI") }),
					);
				} catch {
					// ignore
				}
				const st = this.streamStates.get(streamId);
				if (st) st.status = "aborted";
				this.cleanupStream(streamId);
			},
			getStreamId: () => streamId,
			getStatus: () => this.streamStates.get(streamId)?.status ?? "aborted",
			getResult: () => {
				const st = this.streamStates.get(streamId);
				if (!st) return "" as any; // default fallback
				if (st.resultText !== undefined) return st.resultText as any;
				return (st.resultArray ?? []) as any;
			},
			getError: () => this.streamStates.get(streamId)?.error ?? null,
		};

		return controller;
	}

	// === Connection Management ===

	private async ensureConnected(): Promise<void> {
		if (!this.parentMethods || !this.connectionStatus) {
			await this.connect();
		}
	}

	/**
	 * Reconnect to parent if connection is lost
	 */
	async reconnect(): Promise<void> {
		this.disconnect();
		await this.connect();
	}

	/**
	 * Disconnect from parent
	 */
	disconnect(): void {
		this.parentMethods = null;
		this.connectionPromise = null;
		this.connectionStatus = false;

		// Destroy the underlying Penpal connection if present
		try {
			this.penpalConnection?.destroy?.();
		} catch {
			// no-op
		} finally {
			this.penpalConnection = null;
		}

		this.log("Disconnected from parent");
	}

	/**
	 * Get connection statistics
	 */
	getStats(): {
		options: NuwaClientOptions;
	} {
		return {
			options: this.options,
		};
	}

	/**
	 * Handle method call errors with proper error codes
	 */
	private handleMethodError(methodName: string, error: any): never {
		this.log(`${methodName} failed`, error);

		// Create a structured error with code
		const structuredError = new Error(
			`${methodName} failed: ${error.message || error}`,
		);
		(structuredError as any).code = error.code || "METHOD_CALL_ERROR";
		(structuredError as any).originalError = error;
		(structuredError as any).method = methodName;

		throw structuredError;
	}

	private log(message: string, data?: any): void {
		if (this.options.debug) {
			console.debug(`[NuwaClient SDK] ${message}`, data);
		}
	}

	private normalizeError(error: any): Error {
		if (error instanceof Error) return error;
		try {
			return new Error(
				typeof error === "string" ? error : JSON.stringify(error),
			);
		} catch {
			return new Error("Unknown error");
		}
	}

	// Resolve timeout for a given method using per-method overrides,
	// then global methodTimeout, then the built-in default.
	private getTimeout(method: keyof NuwaClientMethods): number {
		const perMethod = this.options.methodTimeouts?.[method];
		if (typeof perMethod === "number") return perMethod;
		if (typeof this.options.methodTimeout === "number")
			return this.options.methodTimeout;
		// Use per-method defaults if defined
		switch (method) {
			case "sendPrompt":
				return NUWA_SEND_PROMPT_TIMEOUT;
			case "setHeight":
				return NUWA_SET_HEIGHT_TIMEOUT;
			case "addSelection":
				return NUWA_ADD_SELECTION_TIMEOUT;
			case "saveState":
				return NUWA_SAVE_STATE_TIMEOUT;
			case "getState":
				return NUWA_GET_STATE_TIMEOUT;
			case "streamAI":
				return this.options.streamTimeout ?? NUWA_STREAM_TIMEOUT;
			default:
				return NUWA_METHOD_TIMEOUT;
		}
	}

	// Resolve retry count for a given method using per-method overrides,
	// then global methodRetries, then the built-in default.
	private getRetries(method: keyof NuwaClientMethods): number {
		const perMethod = this.options.methodRetriesMap?.[method];
		if (typeof perMethod === "number") return perMethod;
		if (typeof this.options.methodRetries === "number")
			return this.options.methodRetries;
		switch (method) {
			case "sendPrompt":
				return NUWA_SEND_PROMPT_RETRIES;
			case "setHeight":
				return NUWA_SET_HEIGHT_RETRIES;
			case "addSelection":
				return NUWA_ADD_SELECTION_RETRIES;
			case "saveState":
				return NUWA_SAVE_STATE_RETRIES;
			case "getState":
				return NUWA_GET_STATE_RETRIES;
			case "streamAI":
				return this.options.streamRetries ?? NUWA_STREAM_RETRIES;
			default:
				return NUWA_METHOD_RETRIES;
		}
	}

	// Generic retry wrapper used by all outbound calls
	private async callWithRetry<T>(
		method: keyof NuwaClientMethods,
		fn: () => Promise<T>,
	): Promise<T> {
		const retries = this.getRetries(method);
		let attempt = 0;
		let lastError: any;
		while (attempt <= retries) {
			try {
				return await fn();
			} catch (err) {
				lastError = err;
				attempt += 1;
				if (attempt > retries) break;
			}
		}
		// If we get here, all attempts failed; throw structured error
		this.handleMethodError(method as string, lastError);
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

	/**
	 * Reset or arm the overall stream timeout. If no chunks arrive within
	 * the configured window, the stream is aborted on the parent, an error
	 * is surfaced to the consumer, and all local state is cleaned up.
	 */
	private resetStreamTimeout(streamId: string) {
		const timeoutMs = this.getTimeout("streamAI");
		// Clear existing
		const existing = this.streamTimeouts.get(streamId);
		if (existing) clearTimeout(existing);
		if (timeoutMs <= 0) return;
		const t = setTimeout(() => {
			this.log("Stream timeout; aborting", { streamId });
			try {
				this.parentMethods?.abortStream(
					streamId,
					new CallOptions({ timeout: this.getTimeout("streamAI") }),
				);
			} catch {
				// ignore
			}
			const cbs = this.streamCallbacks.get(streamId);
			const st = this.streamStates.get(streamId);
			if (st) {
				st.status = "error";
				st.error = new Error("Stream timed out");
			}
			if (cbs?.onError) {
				cbs.onError(new Error("Stream timed out"));
			} else if (cbs?.onChunk) {
				// Fallback: surface timeout as an error chunk if no onError
				cbs.onChunk({ type: "error", error: new Error("Stream timed out") });
			}
			this.cleanupStream(streamId);
		}, timeoutMs);
		this.streamTimeouts.set(streamId, t);
	}

	/**
	 * Remove all local state (callbacks, timers) associated with a stream.
	 * Safe to call multiple times.
	 */
	private cleanupStream(streamId: string) {
		const t = this.streamTimeouts.get(streamId);
		if (t) clearTimeout(t);
		this.streamTimeouts.delete(streamId);
		this.streamCallbacks.delete(streamId);
	}
}
