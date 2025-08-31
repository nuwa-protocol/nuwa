import { connect, type RemoteProxy, type Reply, WindowMessenger } from "penpal";
import { CapUIError, TransportError } from "../types";
import type { AIResponse, PromptOptions } from "./types";

/**
 * Interface for parent functions that can be called by child iframes
 */
export interface ParentFunctions {
	/**
	 * Send a prompt to the AI backend
	 * @param prompt The prompt text to send
	 * @param options Optional configuration for the request
	 * @returns Promise resolving to the AI response
	 */
	sendPrompt(prompt: string, options?: PromptOptions): Promise<void>;

	/**
	 * Send a message to the parent application
	 * @param type Message type identifier
	 * @param payload Message payload data
	 * @returns Promise resolving when message is sent
	 */
	sendLog(log: string): Promise<void>;

	/**
	 * Set the height of the iframe (convenience method)
	 * @param height Height in pixels or CSS value
	 * @returns Promise resolving when height is set
	 */
	setHeight?(height: string | number): Promise<void>;
}

/**
 * Parent handler interface - implemented by parent applications
 * to handle calls from child iframes
 */
export interface ParentHandler {
	/**
	 * Handle prompt requests from child
	 */
	onSendPrompt?(
		prompt: string,
		options?: PromptOptions,
		origin?: string,
	): Promise<AIResponse>;

	/**
	 * Handle messages from child
	 */
	onSendLog?(log: string, origin?: string): Promise<void>;

	/**
	 * Handle height change requests from child
	 */
	onSetHeight?(height: string | number, origin?: string): Promise<void>;
}

/**
 * Base configuration for parent applications
 */
export interface ParentConfig {
	allowedOrigins?: string[];
	securityPolicy?: Partial<import("./types.js").SecurityPolicy>;
	debug?: boolean;
	timeout?: number;
}

/**
 * Base configuration for child applications
 */
export interface ChildConfig {
	parentOrigin?: string;
	timeout?: number;
	debug?: boolean;
	connectionInfo?: import("./types.js").ConnectionInfo;
}

// Penpal-specific parent methods interface
// Maps shared ParentFunctions to Penpal Reply format
type PenpalParentMethods = {
	sendPrompt(prompt: string, options?: PromptOptions): Reply<AIResponse>;
	sendLog(log: string): Reply<void>;
	setHeight(height: string | number): Reply<void>;
};

export interface NuwaClientOptions extends ChildConfig {
	allowedOrigins?: string[];
	timeout?: number;
	autoConnect?: boolean;
}

/**
 * NuwaClient - Simple iframe communication using Penpal
 * Implements shared ParentFunctions interface for consistency
 */
export class NuwaClient implements ParentFunctions {
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

	// === ParentFunctions Implementation ===

	/**
	 * Send prompt to the parent Nuwa Client
	 */
	async sendPrompt(prompt: string, options?: PromptOptions): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Sending prompt", {
				prompt: prompt.substring(0, 100) + "...",
				options,
			});
			await this.parentMethods!.sendPrompt(prompt, options);
		} catch (error) {
			this.log("Send prompt failed", error);
			throw new CapUIError(`Send prompt failed: ${error}`);
		}
	}

	/**
	 * Send log to the parent Nuwa Client
	 */
	async sendLog(log: string): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Sending log", { log });
			await this.parentMethods!.sendLog(log);
		} catch (error) {
			this.log("Send log failed", error);
			throw new CapUIError(`Send log failed: ${error}`);
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
