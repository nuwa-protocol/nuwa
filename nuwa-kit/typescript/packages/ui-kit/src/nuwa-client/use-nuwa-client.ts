import { useEffect, useRef } from "react";
import { NuwaClient, type NuwaClientOptions } from "./nuwa-client";

export interface useNuwaClientProps extends NuwaClientOptions {
	autoAdjustHeight?: boolean;
	onConnected?: () => void;
	onError?: (error: Error) => void;
}

export interface useNuwaClientReturn {
	nuwaClient: NuwaClient;

	// Auto height management
	containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * React hook for Nuwa Client
 * Provides reactive state management for parent communication
 * Auto-connects on mount and provides callbacks for connection events
 */
export function useNuwaClient(
	props: useNuwaClientProps = {},
): useNuwaClientReturn {
	const {
		autoAdjustHeight = false,
		onConnected,
		onError,
		...nuwaClientOptions
	} = props;

	const containerRef = useRef<HTMLDivElement>(null);

	// Keep a stable NuwaClient instance across renders
	const nuwaClientRef = useRef<NuwaClient | null>(null);
	if (!nuwaClientRef.current) {
		nuwaClientRef.current = new NuwaClient({
			...nuwaClientOptions,
		});
	}
	const nuwaClient = nuwaClientRef.current;

	// Update height function for auto-adjust functionality
	const updateHeight = () => {
		if (autoAdjustHeight && containerRef.current && nuwaClient) {
			const height = containerRef.current.scrollHeight;
			nuwaClient.setHeight(height).catch((err) => {
				console.warn("Failed to auto-adjust height:", err);
			});
		}
	};

	// Initialize NuwaClient and auto-connect
	// biome-ignore lint/correctness/useExhaustiveDependencies: only run once on mount
	useEffect(() => {
		// Auto-connect
		const connect = async () => {
			try {
				await nuwaClient.connect();
				setTimeout(() => {
					onConnected?.();
				}, 0);

				// Trigger initial height update after connection
				setTimeout(updateHeight, 0);
			} catch (err) {
				const error =
					err instanceof Error ? err : new Error("Connection failed");
				onError?.(error);
			}
		};

		connect();

		// Cleanup on unmount
		return () => {
			nuwaClient.disconnect();
		};
	}, []); // Only run once on mount

	// Auto adjust height functionality
	// biome-ignore lint/correctness/useExhaustiveDependencies: sufficient deps
	useEffect(() => {
		if (!autoAdjustHeight || !containerRef.current) return;

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

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateHeight);
		};
	}, [autoAdjustHeight]);

	return {
		nuwaClient: nuwaClient as NuwaClient,

		// Auto height management
		containerRef: containerRef as React.RefObject<HTMLDivElement>,
	};
}
