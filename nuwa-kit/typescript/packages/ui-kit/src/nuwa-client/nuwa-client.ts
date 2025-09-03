import {
	CallOptions,
	connect,
	type RemoteProxy,
	type Reply,
	WindowMessenger,
} from "penpal";

// Default timeout for Penpal connections
export const NUWA_CLIENT_TIMEOUT = 1000;

// Default timeout for method calls
export const NUWA_METHOD_TIMEOUT = 2000;

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
	autoConnect?: boolean;
	debug?: boolean;
	methodTimeout?: number;
}

/**
 * NuwaClient - Simple iframe communication using Penpal
 * Implements shared NuwaClientMethods interface for consistency
 */
export class NuwaClient implements NuwaClientMethods {
	private parentMethods: RemoteProxy<PenpalParentMethods> | null = null;
	private connectionStatus: boolean = false;
	private connectionPromise: Promise<void> | null = null;
	private options: NuwaClientOptions;
	private methodTimeout: number;

	constructor(options: NuwaClientOptions = {}) {
		this.options = {
			allowedOrigins: ["*"],
			timeout: NUWA_CLIENT_TIMEOUT,
			debug: false,
			autoConnect: true,
			methodTimeout: NUWA_METHOD_TIMEOUT,
			...options,
		};

		this.methodTimeout = this.options.methodTimeout || NUWA_METHOD_TIMEOUT;

		if (this.options.autoConnect) {
			// Auto-connect when instantiated
			this.connect().catch((error) => {
				this.log("Auto-connect failed", error);
			});
		}

		this.log("NuwaClient initialized", this.options);
	}

	/**
	 * Connect to parent window via Penpal
	 */
	async connect(): Promise<void> {
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		this.connectionPromise = this.establishConnection();
		return this.connectionPromise;
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

			const conn = connect<PenpalParentMethods>({
				messenger,
				timeout: this.options.timeout || NUWA_CLIENT_TIMEOUT,
				// log: debug("Child"),
			});

			this.parentMethods = await conn.promise;
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
		try {
			await this.parentMethods!.sendPrompt(
				prompt,
				new CallOptions({ timeout: this.methodTimeout }),
			);
		} catch (error: any) {
			this.handleMethodError("sendPrompt", error);
		}
	}

	/**
	 * Set the height of the iframe in the parent
	 */
	async setHeight(height: string | number): Promise<void> {
		await this.ensureConnected();

		this.log("Setting height", { height });
		try {
			await this.parentMethods!.setHeight(
				height,
				new CallOptions({ timeout: this.methodTimeout }),
			);
		} catch (error: any) {
			this.handleMethodError("setHeight", error);
		}
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
		try {
			await this.parentMethods!.addSelection(
				label,
				normalizedMessage,
				new CallOptions({ timeout: this.methodTimeout }),
			);
		} catch (error: any) {
			this.handleMethodError("addSelection", error);
		}
	}

	/**
	 * Save state data to the parent Nuwa client
	 */
	async saveState<T = any>(state: T): Promise<void> {
		await this.ensureConnected();

		this.log("Saving state", { stateType: typeof state });
		try {
			await this.parentMethods!.saveState(
				state,
				new CallOptions({ timeout: this.methodTimeout }),
			);
		} catch (error: any) {
			this.handleMethodError("saveState", error);
		}
	}

	/**
	 * Retrieve state data from the parent Nuwa client
	 */
	async getState<T = any>(): Promise<T | null> {
		await this.ensureConnected();

		this.log("Getting state");
		try {
			const state = await this.parentMethods!.getState(
				new CallOptions({ timeout: this.methodTimeout }),
			);
			return state as T | null;
		} catch (error: any) {
			this.handleMethodError("getState", error);
			return null; // This will never be reached due to handleMethodError throwing
		}
	}

	// === Connection Management ===

	private async ensureConnected(): Promise<void> {
		if (!this.parentMethods || !this.connectionStatus) {
			await this.connect();
		}
	}

	/**
	 * Check if connected to parent Nuwa Client
	 */
	get isConnected(): boolean {
		return this.connectionStatus && !!this.parentMethods;
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

		this.log("Disconnected from parent");
	}

	/**
	 * Get connection statistics
	 */
	getStats(): {
		isConnected: boolean;
		options: NuwaClientOptions;
	} {
		return {
			isConnected: this.isConnected,
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
			console.debug(`[NuwaClient] ${message}`, data);
		}
	}
}
