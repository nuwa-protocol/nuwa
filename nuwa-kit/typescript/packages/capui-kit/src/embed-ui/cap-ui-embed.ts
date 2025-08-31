import { connect, type RemoteProxy, type Reply, WindowMessenger } from "penpal";
import type {
	AIResponse,
	ChildConfig,
	ParentFunctions,
	PromptOptions,
	StreamingPromptOptions,
} from "../shared/parent-functions.js";
import { CapUIError, TransportError } from "../shared/types.js";

// Penpal-specific parent methods interface
// Maps shared ParentFunctions to Penpal Reply format
type PenpalParentMethods = {
	sendPrompt(prompt: string, options?: PromptOptions): Reply<AIResponse>;
	sendPromptStreaming(
		prompt: string,
		options: StreamingPromptOptions,
	): Reply<string>;
	sendMessage(type: string, payload: any): Reply<void>;
	getContext(keys?: string[]): Reply<any>;
	setHeight(height: string | number): Reply<void>;
	showLoading(message?: string): Reply<void>;
	hideLoading(): Reply<void>;
};

export interface CapEmbedUIKitOptions extends ChildConfig {
	allowedOrigins?: string[];
	timeout?: number;
	autoConnect?: boolean;
}

/**
 * CapUI Embed UI Kit - Simple iframe communication using Penpal
 * Implements shared ParentFunctions interface for consistency with artifact-ui
 */
export class CapEmbedUIKit implements ParentFunctions {
	private parentMethods: RemoteProxy<PenpalParentMethods> | null = null;
	private connectionStatus: boolean = false;
	private connectionPromise: Promise<void> | null = null;
	private options: CapEmbedUIKitOptions;

	constructor(options: CapEmbedUIKitOptions = {}) {
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

		this.log("CapEmbedUIKit initialized", this.options);
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
	 * Send prompt to AI backend via parent
	 */
	async sendPrompt(
		prompt: string,
		options?: PromptOptions,
	): Promise<AIResponse> {
		await this.ensureConnected();

		try {
			this.log("Sending prompt", {
				prompt: prompt.substring(0, 100) + "...",
				options,
			});
			return await this.parentMethods!.sendPrompt(prompt, options);
		} catch (error) {
			this.log("Send prompt failed", error);
			throw new CapUIError(`Send prompt failed: ${error}`);
		}
	}

	/**
	 * Send streaming prompt to AI backend via parent
	 */
	async sendPromptStreaming(
		prompt: string,
		options: StreamingPromptOptions,
	): Promise<string> {
		await this.ensureConnected();

		try {
			this.log("Sending streaming prompt", {
				prompt: prompt.substring(0, 100) + "...",
				options: { ...options, onChunk: undefined }, // Don't log callbacks
			});

			return await this.parentMethods!.sendPromptStreaming(prompt, options);
		} catch (error) {
			this.log("Send streaming prompt failed", error);
			throw new CapUIError(`Send streaming prompt failed: ${error}`);
		}
	}

	/**
	 * Send message to parent
	 */
	async sendMessage(type: string, payload: any): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Sending message", { type, payload });
			await this.parentMethods!.sendMessage(type, payload);
		} catch (error) {
			this.log("Send message failed", error);
			throw new CapUIError(`Send message failed: ${error}`);
		}
	}

	/**
	 * Get context from parent
	 */
	async getContext(keys?: string[]): Promise<any> {
		await this.ensureConnected();

		try {
			this.log("Getting context", { keys });
			return await this.parentMethods!.getContext(keys);
		} catch (error) {
			this.log("Get context failed", error);
			throw new CapUIError(`Get context failed: ${error}`);
		}
	}

	/**
	 * Set iframe height
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
	 * Show loading state in parent
	 */
	async showLoading(message?: string): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Showing loading", { message });
			await this.parentMethods!.showLoading(message);
		} catch (error) {
			this.log("Show loading failed", error);
			throw new CapUIError(`Show loading failed: ${error}`);
		}
	}

	/**
	 * Hide loading state in parent
	 */
	async hideLoading(): Promise<void> {
		await this.ensureConnected();

		try {
			this.log("Hiding loading");
			await this.parentMethods!.hideLoading();
		} catch (error) {
			this.log("Hide loading failed", error);
			throw new CapUIError(`Hide loading failed: ${error}`);
		}
	}

	// === Legacy Methods (for backward compatibility) ===

	/**
	 * @deprecated Use sendPrompt instead
	 */
	async sendPromptLegacy(prompt: string): Promise<string> {
		const response = await this.sendPrompt(prompt);
		return response.content;
	}

	/**
	 * @deprecated Use setHeight instead
	 */
	async setUIHeight(height: number): Promise<void> {
		await this.setHeight(height);
	}

	// === Connection Management ===

	private async ensureConnected(): Promise<void> {
		if (!this.parentMethods || !this.connectionStatus) {
			await this.connect();
		}
	}

	/**
	 * Check if connected to parent
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
		options: CapEmbedUIKitOptions;
	} {
		return {
			isConnected: this.isConnected,
			options: this.options,
		};
	}

	private log(message: string, data?: any): void {
		if (this.options.debug) {
			console.log(`[CapEmbedUIKit] ${message}`, data);
		}
	}
}
