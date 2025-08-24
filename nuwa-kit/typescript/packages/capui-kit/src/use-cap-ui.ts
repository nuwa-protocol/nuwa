import { useEffect, useRef, useState } from "react";
import { CapUI, type CapUIOptions } from "./cap-ui";

export interface UseCapUIParentProps {
	onReceiveMessage?(incomingMessage: string): string;
	onError?(error: string): void;
}

export const useCapUI = ({
	onReceiveMessage,
	onError,
}: UseCapUIParentProps) => {
	const [isConnected, setIsConnected] = useState(false);
	const capUIRef = useRef<CapUI | null>(null);

	useEffect(() => {
		const options: CapUIOptions = {
			onReceiveMessage,
			onError,
			onConnectionChange: setIsConnected,
		};

		capUIRef.current = new CapUI(options);

		return () => {
			capUIRef.current?.disconnect();
		};
	}, [onReceiveMessage, onError]);

	const sendMessage = async (msg: string) => {
		if (!capUIRef.current) throw new Error("CapUI not initialized");
		return await capUIRef.current.sendMessage(msg);
	};

	const sendToolCall = async (toolCall: string) => {
		if (!capUIRef.current) throw new Error("CapUI not initialized");
		return await capUIRef.current.sendToolCall(toolCall);
	};

	const sendPrompt = async (prompt: string) => {
		if (!capUIRef.current) throw new Error("CapUI not initialized");
		return await capUIRef.current.sendPrompt(prompt);
	};

	return {
		isConnected,
		sendMessage,
		sendToolCall,
		sendPrompt,
	};
};
