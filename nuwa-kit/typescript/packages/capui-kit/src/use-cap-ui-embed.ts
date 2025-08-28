import { useCallback, useEffect, useRef, useState } from "react";
import { CapEmbedUIKit } from "./cap-ui-embed";

type UseCapEmbedUIKitProps = {
	autoAdjustHeight?: boolean;
};

export const useCapEmbedUIKit = ({
	autoAdjustHeight = false,
}: UseCapEmbedUIKitProps) => {
	const [embedUIKit, setEmbedUIKit] = useState<CapEmbedUIKit | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const setUIHeight = useCallback(
		async (height: number) => {
			if (!embedUIKit) throw new Error("CapUI not initialized");
			return await embedUIKit.setUIHeight(height);
		},
		[embedUIKit],
	);

	useEffect(() => {
		const embedUIKit = new CapEmbedUIKit();
		embedUIKit
			.connect()
			.then(() => {
				setEmbedUIKit(embedUIKit);
				setIsConnected(embedUIKit.isConnected);
			})
			.catch((error) => {
				console.error("Failed to connect to parent:", error);
			});
	}, []);

	const sendMessage = async (msg: string) => {
		if (!embedUIKit) throw new Error("CapUI not initialized");
		return await embedUIKit.sendMessage(msg);
	};

	const sendPrompt = async (prompt: string) => {
		if (!embedUIKit) throw new Error("CapUI not initialized");
		return await embedUIKit.sendPrompt(prompt);
	};

	// auto adjust height with mutation observer
	useEffect(() => {
		if (!autoAdjustHeight || !embedUIKit || !containerRef.current) return;

		const updateHeight = () => {
			if (containerRef.current) {
				const height = containerRef.current.scrollHeight;
				setUIHeight(height);
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
			attributeFilter: ['style', 'class']
		});

		// Also listen for window resize
		window.addEventListener("resize", updateHeight);

		// Initial height update
		updateHeight();

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateHeight);
		};
	}, [autoAdjustHeight, embedUIKit, setUIHeight]);

	return {
		isConnected,
		sendMessage,
		setUIHeight,
		sendPrompt,
		containerRef,
	};
};
