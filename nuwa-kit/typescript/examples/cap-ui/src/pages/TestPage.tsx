import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { useState } from "react";

export default function TestPage() {
    const [inputValue, setInputValue] = useState("");
    const { isConnected, sendLog, sendPrompt, containerRef } = useNuwaClient({
        autoAdjustHeight: true,
    });

    return (
        <div ref={containerRef} className="h-full flex flex-col">
            <h1 className="text-2xl font-bold m-4">Cap Embed UI Demo</h1>
            <p className="text-sm m-4">
                Enter a message below and click the button to send it to the Nuwa
                Client. Send message can help you to debug: try it and see the console
                output. Send prompt will submit a new message to the AI.
            </p>
            <span className="ml-4 text-sm">
                Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
            </span>
            <div className="p-4 flex gap-2 w-full">
                <input
                    className="border border-gray-300 rounded-md p-2 w-full"
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                />
            </div>
            <div className="p-4 flex gap-2 w-full">
                <button
                    type="button"
                    onClick={async () => {
                        await sendLog(inputValue || "Hello from child iframe page");
                    }}
                    disabled={!isConnected}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 "
                >
                    {isConnected ? "Send Message" : "Connecting..."}
                </button>
                <button
                    type="button"
                    onClick={async () => {
                        await sendPrompt(inputValue);
                    }}
                    disabled={!isConnected}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 "
                >
                    {isConnected ? "Send Prompt" : "Connecting..."}
                </button>
            </div>
        </div>
    );
}