import { connect, WindowMessenger } from "penpal";

// Use any for simplicity since penpal types may vary
type RemoteProxy<T> = any;
type Reply<T> = Promise<T>;

export interface CapUIOptions {
	onReceiveMessage?(incomingMessage: string): string;
	onError?(error: string): void;
	onConnectionChange?(isConnected: boolean): void;
}

type ParentMethods = {
	sendMessage(msg: string): Reply<string>;
	sendToolCall(toolCall: string): Reply<string>;
	sendPrompt(prompt: string): Reply<string>;
};

export class CapUI {
	private parentMethods: RemoteProxy<ParentMethods> | null = null;
	private options: CapUIOptions;
	private connectionPromise: Promise<void> | null = null;

	constructor(options: CapUIOptions = {}) {
		this.options = options;
		this.initConnection();
	}

	private async initConnection(): Promise<void> {
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		this.connectionPromise = this.establishConnection();
		return this.connectionPromise;
	}

	private async establishConnection(): Promise<void> {
		try {
			const messenger = new WindowMessenger({
				remoteWindow: window.parent,
				allowedOrigins: ["*"], // Allow all origins for testing
			});

			const conn = connect<ParentMethods>({
				messenger,
				methods: {
					sendMessage: (msg: string) => this.options.onReceiveMessage?.(msg),
				},
				timeout: 15000,
			});

			this.parentMethods = await conn.promise;
			this.options.onConnectionChange?.(true);
		} catch (error) {
			console.error("Failed to connect to parent:", error);
			this.options.onError?.(
				error instanceof Error ? error.message : "Connection failed",
			);
			this.options.onConnectionChange?.(false);
		}
	}

	get isConnected(): boolean {
		return !!this.parentMethods;
	}

	async sendMessage(msg: string): Promise<string> {
		if (!this.parentMethods) {
			await this.initConnection();
			if (!this.parentMethods) {
				throw new Error("Not connected to parent");
			}
		}
		return await this.parentMethods.sendMessage(msg);
	}

	async sendToolCall(toolCall: string): Promise<string> {
		if (!this.parentMethods) {
			await this.initConnection();
			if (!this.parentMethods) {
				throw new Error("Not connected to parent");
			}
		}
		return await this.parentMethods.sendToolCall(toolCall);
	}

	async sendPrompt(prompt: string): Promise<string> {
		if (!this.parentMethods) {
			await this.initConnection();
			if (!this.parentMethods) {
				throw new Error("Not connected to parent");
			}
		}
		return await this.parentMethods.sendPrompt(prompt);
	}

	disconnect(): void {
		this.parentMethods = null;
		this.connectionPromise = null;
		this.options.onConnectionChange?.(false);
	}
}
