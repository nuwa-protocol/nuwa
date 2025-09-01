import { connect, type RemoteProxy, type Reply, WindowMessenger } from "penpal";
import { CapUIError, TransportError } from "../types";

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
	addSelection(label: string, message: string | Record<string, any>): Promise<void>;

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
	addSelection(label: string, message: string | Record<string, any>): Reply<void>;
	saveState(state: any): Reply<void>;
	getState(): Reply<any>;
};

export interface NuwaClientOptions {
	allowedOrigins?: string[];
	timeout?: number;
	autoConnect?: boolean;
	debug?: boolean;
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

	constructor(options: NuwaClientOptions = {}) {
		this.options = {
			allowedOrigins: ["*"],
			timeout: 5000,
			debug: false,
			autoConnect: true,
			...options,
		};

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

			const messenger = new WindowMessenger({
				remoteWindow: window.parent,
				allowedOrigins: this.options.allowedOrigins || ["*"],
			});

			const conn = connect<PenpalParentMethods>({
				messenger,
				timeout: this.options.timeout || 5000,
			});

			this.parentMethods = await conn.promise;
			this.connectionStatus = true;

			this.log("Connected to parent successfully");
		} catch (error) {
			this.log("Failed to connect to parent", error);
			this.connectionStatus = false;
			throw new TransportError(`Connection failed: ${error}`);
		}
	}

	// === NuwaClientMethods Implementation ===

	/**
	 * Send prompt to the parent Nuwa Client
	 */
	async sendPrompt(prompt: string): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Sending prompt", {
				prompt: prompt.substring(0, 100) + "...",
			});
			await this.parentMethods!.sendPrompt(prompt);
		} catch (error) {
			this.log("Send prompt failed", error);
			throw new CapUIError(`Send prompt failed: ${error}`);
		}
	}

	/**
	 * Set the height of the iframe in the parent
	 */
	async setHeight(height: string | number): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Setting height", { height });
			await this.parentMethods!.setHeight(height);
		} catch (error) {
			this.log("Set height failed", error);
			throw new CapUIError(`Set height failed: ${error}`);
		}
	}

	/**
	 * Add a selection to the parent Nuwa client
	 */
	async addSelection(label: string, message: string | Record<string, any>): Promise<void> {
		await this.ensureConnected();

		try {
			// Convert message to string if it's an object
			const normalizedMessage = 
				typeof message === 'string' 
					? message 
					: JSON.stringify(message);
			
			this.log("Sending selection", { name: label });
			await this.parentMethods!.addSelection(label, normalizedMessage);
		} catch (error) {
			this.log("Send selection failed", error);
			throw new CapUIError(`Send selection failed: ${error}`);
		}
	}

	/**
	 * Save state data to the parent Nuwa client
	 */
	async saveState<T = any>(state: T): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Saving state", { stateType: typeof state });
			await this.parentMethods!.saveState(state);
		} catch (error) {
			this.log("Save state failed", error);
			throw new CapUIError(`Save state failed: ${error}`);
		}
	}

	/**
	 * Retrieve state data from the parent Nuwa client
	 */
	async getState<T = any>(): Promise<T | null> {
		await this.ensureConnected();

		try {
			this.log("Getting state");
			const state = await this.parentMethods!.getState();
			return state as T | null;
		} catch (error) {
			this.log("Get state failed", error);
			throw new CapUIError(`Get state failed: ${error}`);
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

	private log(message: string, data?: any): void {
		if (this.options.debug) {
			console.log(`[NuwaClient] ${message}`, data);
		}
	}
}
