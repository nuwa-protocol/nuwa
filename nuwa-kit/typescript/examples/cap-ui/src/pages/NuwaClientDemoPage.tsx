import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { useState } from "react";

type TabType = "prompt" | "selection" | "state";

export default function NuwaClientDemoPage() {
    const [activeTab, setActiveTab] = useState<TabType>("prompt");
    const [inputValue, setInputValue] = useState("");
    const [selectionLabel, setSelectionLabel] = useState("");
    const [selectionMessage, setSelectionMessage] = useState("");
    const [stateData, setStateData] = useState("");
    const [savedState, setSavedState] = useState<any>(null);

    // Connection state is now provided by the hook
    const [error, setError] = useState<string | null>(null);

    const {
        nuwaClient,
        isConnected: isNuwaConnected,
        containerRef,
    } = useNuwaClient({
        autoAdjustHeight: true,
        debug: true,
        onConnected: () => {
            console.log("Connected to parent!");
            setError(null);
        },
        onError: (err) => {
            console.error("Connection error:", err);
            setError(err.message);
        },
    });

    const handleSendPrompt = async () => {
        try {
            await nuwaClient.sendPrompt(inputValue || "Hello from child iframe page");
            setInputValue("");
        } catch (err) {
            console.error("Failed to send prompt:", err);
            setError(err instanceof Error ? err.message : "Send prompt failed");
        }
    };

    const handleAddSelection = async () => {
        try {
            await nuwaClient.addSelection(
                selectionLabel || "Test Selection",
                selectionMessage || "This is a test selection message",
            );
            setSelectionLabel("");
            setSelectionMessage("");
        } catch (err) {
            console.error("Failed to add selection:", err);
            setError(err instanceof Error ? err.message : "Add selection failed");
        }
    };

    const handleSaveState = async () => {
        try {
            const dataToSave = stateData
                ? JSON.parse(stateData)
                : {
                    timestamp: Date.now(),
                    message: "Test state data",
                };
            await nuwaClient.saveState(dataToSave);
            setSavedState(dataToSave);
            setStateData("");
        } catch (err) {
            console.error("Failed to save state:", err);
            setError(err instanceof Error ? err.message : "Save state failed");
        }
    };

    const handleGetState = async () => {
        try {
            const state = await nuwaClient.getState();
            setSavedState(state);
        } catch (err) {
            console.error("Failed to get state:", err);
            setError(err instanceof Error ? err.message : "Get state failed");
        }
    };

    const tabs = [
        { id: "prompt" as TabType, label: "Prompt", icon: "💬" },
        { id: "selection" as TabType, label: "Selection", icon: "📋" },
        { id: "state" as TabType, label: "State", icon: "💾" },
    ];

    return (
        <div ref={containerRef} className="p-4">
            <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border">
                {/* Header */}
                <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">
                        A UI Demo
                    </h2>
                    <div className="flex items-center mt-2">
                        <div
                            className={`w-2 h-2 rounded-full mr-2 ${isNuwaConnected
                                ? "bg-green-500"
                                : "bg-red-500 animate-pulse"
                                }`}
                        ></div>
                        <span className="text-sm text-gray-600">
                            {isNuwaConnected ? "Connected" : "Disconnected"}
                        </span>
                    </div>
                    {error && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                            {error}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex border-b">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${activeTab === tab.id
                                ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                                : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                                }`}
                        >
                            <div className="flex flex-col items-center">
                                <span className="text-sm mb-1">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-4">
                    {activeTab === "prompt" && (
                        <div className="space-y-3">
                            <textarea
                                className="w-full border border-gray-300 rounded p-2 text-sm resize-none"
                                rows={4}
                                placeholder="Enter your prompt..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={handleSendPrompt}
                                disabled={!isNuwaConnected}
                                className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                            >
                                Send Prompt
                            </button>
                        </div>
                    )}

                    {activeTab === "selection" && (
                        <div className="space-y-3">
                            <input
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                placeholder="Label"
                                value={selectionLabel}
                                onChange={(e) => setSelectionLabel(e.target.value)}
                            />
                            <textarea
                                className="w-full border border-gray-300 rounded p-2 text-sm resize-none"
                                rows={3}
                                placeholder="Message"
                                value={selectionMessage}
                                onChange={(e) => setSelectionMessage(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={handleAddSelection}
                                disabled={!isNuwaConnected}
                                className="w-full px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:bg-gray-300 transition-colors"
                            >
                                Add Selection
                            </button>
                        </div>
                    )}

                    {activeTab === "state" && (
                        <div className="space-y-3">
                            <textarea
                                className="w-full border border-gray-300 rounded p-2 text-sm resize-none"
                                rows={2}
                                placeholder='{"key": "value"}'
                                value={stateData}
                                onChange={(e) => setStateData(e.target.value)}
                            />
                            <div className="flex space-x-2">
                                <button
                                    type="button"
                                    onClick={handleSaveState}
                                    disabled={!isNuwaConnected}
                                    className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGetState}
                                    disabled={!isNuwaConnected}
                                    className="flex-1 px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Get
                                </button>
                            </div>
                            {savedState && (
                                <div className="mt-2 p-2 bg-gray-50 border rounded text-xs">
                                    <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(savedState, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}