import {
	CallOptions,
	connect,
	debug,
	type RemoteProxy,
	type Reply,
	WindowMessenger,
} from "penpal";

// Default timeout for Penpal connections
export const NUWA_CLIENT_TIMEOUT = 1000;

// Default timeout for method calls
export const NUWA_METHOD_TIMEOUT = 2000;

// Per-method default timeouts (can be overridden via options)
export const NUWA_SEND_PROMPT_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_SET_HEIGHT_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_ADD_SELECTION_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_SAVE_STATE_TIMEOUT = NUWA_METHOD_TIMEOUT;
export const NUWA_GET_STATE_TIMEOUT = 3000;

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
}

// Penpal-specific parent methods interface
// Maps shared NuwaClientMethods to Penpal Reply format
type PenpalParentMethods = {
	sendPrompt(prompt: string): Reply<void>;
	setHeight(height: string | number): Reply<void>;
	addSelection(
		label: string,
		message: string | Record<string, any>,
	): Reply<void>;
	saveState(state: any): Reply<void>;
	getState(): Reply<any>;
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

			// Create and keep the connection so we can destroy it on disconnect
			this.penpalConnection = connect<PenpalParentMethods>({
				messenger,
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
}
