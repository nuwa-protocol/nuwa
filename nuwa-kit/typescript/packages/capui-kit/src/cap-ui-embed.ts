import { connect, type RemoteProxy, type Reply, WindowMessenger } from "penpal";

type ParentMethods = {
	sendMessage(msg: string): Reply<string>;
	sendPrompt(prompt: string): Reply<string>;
	setUIHeight(height: number): Reply<void>;
};

export class CapEmbedUIKit {
	private parentMethods: RemoteProxy<ParentMethods> | null = null;
	private connectionStatus: boolean = false;
	private connectionPromise: Promise<void> | null = null;

	async connect(): Promise<void> {
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
				timeout: 3000,
			});

			this.parentMethods = await conn.promise;
			this.connectionStatus = true;
		} catch (error) {
			console.error("Failed to connect to parent:", error);
			this.connectionStatus = false;
		}
	}

	get isConnected(): boolean {
		return !!this.connectionStatus;
	}

	async sendMessage(msg: string): Promise<string> {
		if (!this.parentMethods) {
			throw new Error("Not connected to parent");
		}
		return await this.parentMethods.sendMessage(msg);
	}

	async sendPrompt(prompt: string): Promise<string> {
		if (!this.parentMethods) {
			throw new Error("Not connected to parent");
		}
		return await this.parentMethods.sendPrompt(prompt);
	}

	async setUIHeight(height: number): Promise<void> {
		if (!this.parentMethods) {
			throw new Error("Not connected to parent");
		}
		return await this.parentMethods.setUIHeight(height);
	}

	disconnect(): void {
		this.parentMethods = null;
		this.connectionPromise = null;
		this.connectionStatus = false;
	}
}
