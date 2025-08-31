import { useEffect, useRef, useState } from "react";
import { NuwaClient, type NuwaClientOptions } from "./nuwa-client";

export interface useNuwaClientProps extends NuwaClientOptions {
	autoAdjustHeight?: boolean;
}

export interface useNuwaClientReturn {
	nuwaClient: NuwaClient | null;
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;

	// Convenience methods
	sendPrompt: (prompt: string) => Promise<void>;
	sendLog: (log: string) => Promise<void>;
	setHeight: (height: string | number) => Promise<void>;

	// Connection management
	connect: () => Promise<void>;
	disconnect: () => void;
	reconnect: () => Promise<void>;

	// Auto height management
	containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * React hook for Nuwa Client
 * Provides reactive state management for parent communication
 */
export function useNuwaClient(
	props: useNuwaClientProps = {},
): useNuwaClientReturn {
	const { autoAdjustHeight = false, ...nuwaClientOptions } = props;

	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const nuwaClientRef = useRef<NuwaClient | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Initialize NuwaClient
	// biome-ignore lint/correctness/useExhaustiveDependencies: only run once on mount
	useEffect(() => {
		const nuwaClient = new NuwaClient({
			autoConnect: false, // We'll manage connection manually for better React integration
			...nuwaClientOptions,
		});

		nuwaClientRef.current = nuwaClient;

		// Auto-connect by default
		handleConnect();

		// Cleanup on unmount
		return () => {
			if (nuwaClientRef.current) {
				nuwaClientRef.current.disconnect();
			}
		};
	}, []); // Only run once on mount

	const handleConnect = async () => {
		if (!nuwaClientRef.current || isConnecting) return;

		setIsConnecting(true);
		setError(null);

		try {
			await nuwaClientRef.current.connect();
			setIsConnected(true);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Connection failed";
			setError(errorMessage);
			setIsConnected(false);
		} finally {
			setIsConnecting(false);
		}
	};

	const handleDisconnect = () => {
		if (nuwaClientRef.current) {
			nuwaClientRef.current.disconnect();
			setIsConnected(false);
			setError(null);
		}
	};

	const handleReconnect = async () => {
		if (!nuwaClientRef.current) return;

		setIsConnecting(true);
		setError(null);

		try {
			await nuwaClientRef.current.reconnect();
			setIsConnected(true);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Reconnection failed";
			setError(errorMessage);
			setIsConnected(false);
		} finally {
			setIsConnecting(false);
		}
	};

	// Convenience methods that handle errors gracefully
	const sendPrompt = async (prompt: string): Promise<void> => {
		if (!nuwaClientRef.current) {
			throw new Error("NuwaClient not initialized");
		}

		try {
			await nuwaClientRef.current.sendPrompt(prompt);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Send prompt failed";
			setError(errorMessage);
			throw err;
		}
	};

	const sendLog = async (log: string): Promise<void> => {
		if (!nuwaClientRef.current) {
			throw new Error("NuwaClient not initialized");
		}

		try {
			await nuwaClientRef.current.sendLog(log);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Send message failed";
			setError(errorMessage);
			throw err;
		}
	};

	const setHeight = async (height: string | number): Promise<void> => {
		if (!nuwaClientRef.current) {
			throw new Error("NuwaClient not initialized");
		}

		try {
			await nuwaClientRef.current.setHeight(height);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Set height failed";
			setError(errorMessage);
			throw err;
		}
	};

	// Auto adjust height functionality
	// biome-ignore lint/correctness/useExhaustiveDependencies: sufficient deps
	useEffect(() => {
		if (
			!autoAdjustHeight ||
			!nuwaClientRef.current ||
			!containerRef.current ||
			!isConnected
		)
			return;

		const updateHeight = () => {
			if (containerRef.current) {
				const height = containerRef.current.scrollHeight;
				setHeight(height).catch((err) => {
					console.warn("Failed to auto-adjust height:", err);
				});
			}
		};

		// Create a MutationObserver to watch for DOM changes
		const observer = new MutationObserver(() => {
			// Use requestAnimationFrame to ensure DOM has updated
			requestAnimationFrame(updateHeight);
		});

		// Watch for changes in the container and its children
		observer.observe(containerRef.current, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style", "class"],
		});

		// Also listen for window resize
		window.addEventListener("resize", updateHeight);

		// Initial height update
		updateHeight();

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateHeight);
		};
	}, [autoAdjustHeight, isConnected]);

	return {
		nuwaClient: nuwaClientRef.current,
		isConnected,
		isConnecting,
		error,

		// Convenience methods
		sendPrompt,
		sendLog,
		setHeight,

		// Connection management
		connect: handleConnect,
		disconnect: handleDisconnect,
		reconnect: handleReconnect,

		// Auto height management
		containerRef: containerRef as React.RefObject<HTMLDivElement>,
	};
}
