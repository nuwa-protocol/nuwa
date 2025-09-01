import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { useState } from "react";

type TabType = "prompt" | "selection" | "state" | "height" | "connection";

export default function TestPage() {
    const [activeTab, setActiveTab] = useState<TabType>("prompt");
    const [inputValue, setInputValue] = useState("");
    const [selectionLabel, setSelectionLabel] = useState("");
    const [selectionMessage, setSelectionMessage] = useState("");
    const [stateData, setStateData] = useState("");
    const [savedState, setSavedState] = useState<any>(null);
    const [height, setHeightValue] = useState("400");

    const {
        isConnected,

        error,
        sendPrompt,
        addSelection,
        saveState,
        getState,
        setHeight,
        connect,
        disconnect,
        reconnect,
        containerRef,
    } = useNuwaClient({
        autoAdjustHeight: false,
        debug: true,
    });

    const handleSendPrompt = async () => {
        try {
            await sendPrompt(inputValue || "Hello from child iframe page");
            setInputValue("");
        } catch (err) {
            console.error("Failed to send prompt:", err);
        }
    };

    const handleAddSelection = async () => {
        try {
            await addSelection(
                selectionLabel || "Test Selection",
                selectionMessage || "This is a test selection message",
            );
            setSelectionLabel("");
            setSelectionMessage("");
        } catch (err) {
            console.error("Failed to add selection:", err);
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
            await saveState(dataToSave);
            setSavedState(dataToSave);
            setStateData("");
        } catch (err) {
            console.error("Failed to save state:", err);
        }
    };

    const handleGetState = async () => {
        try {
            const state = await getState();
            setSavedState(state);
        } catch (err) {
            console.error("Failed to get state:", err);
        }
    };

    const handleSetHeight = async () => {
        try {
            await setHeight(parseInt(height) || 400);
        } catch (err) {
            console.error("Failed to set height:", err);
        }
    };

    const tabs = [
        { id: "prompt" as TabType, label: "Prompt", icon: "💬" },
        { id: "selection" as TabType, label: "Selection", icon: "📋" },
        { id: "state" as TabType, label: "State", icon: "💾" },
        { id: "height" as TabType, label: "Height", icon: "📏" },
        { id: "connection" as TabType, label: "Connection", icon: "🔗" },
    ];

    return (
        <div className="p-4">
            <div
                ref={containerRef}
                className="max-w-md mx-auto bg-white rounded-lg shadow-lg border"
            >
                {/* Header */}
                <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Nuwa Client Demo
                    </h2>
                    <div className="flex items-center mt-2">
                        <div
                            className={`w-2 h-2 rounded-full mr-2 ${!isConnected
                                ? "bg-yellow-500 animate-pulse"
                                : isConnected
                                    ? "bg-green-500"
                                    : "bg-red-500"
                                }`}
                        ></div>
                        <span className="text-sm text-gray-600">
                            {!isConnected
                                ? "Connecting..."
                                : isConnected
                                    ? "Connected"
                                    : "Disconnected"}
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
                                disabled={!isConnected}
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
                                disabled={!isConnected}
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
                                    disabled={!isConnected}
                                    className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGetState}
                                    disabled={!isConnected}
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

                    {activeTab === "height" && (
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="range"
                                    min="200"
                                    max="800"
                                    value={height}
                                    onChange={(e) => setHeightValue(e.target.value)}
                                    className="flex-1"
                                />
                                <span className="text-xs font-mono w-12">{height}px</span>
                            </div>
                            <input
                                type="number"
                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                placeholder="Height in pixels"
                                value={height}
                                onChange={(e) => setHeightValue(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={handleSetHeight}
                                disabled={!isConnected}
                                className="w-full px-3 py-2 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600 disabled:bg-gray-300 transition-colors"
                            >
                                Set Height
                            </button>
                        </div>
                    )}

                    {activeTab === "connection" && (
                        <div className="space-y-3">
                            <div className="text-center">
                                <div
                                    className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3 ${!isConnected
                                        ? "bg-yellow-100"
                                        : isConnected
                                            ? "bg-green-100"
                                            : "bg-red-100"
                                        }`}
                                >
                                    <div
                                        className={`w-8 h-8 rounded-full ${!isConnected
                                            ? "bg-yellow-500 animate-pulse"
                                            : isConnected
                                                ? "bg-green-500"
                                                : "bg-red-500"
                                            }`}
                                    ></div>
                                </div>
                                <p className="text-sm font-medium mb-4">
                                    {!isConnected
                                        ? "Connecting..."
                                        : isConnected
                                            ? "Connected"
                                            : "Disconnected"}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={connect}
                                    disabled={isConnected || !isConnected}
                                    className="w-full px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Connect
                                </button>
                                <button
                                    type="button"
                                    onClick={disconnect}
                                    disabled={!isConnected}
                                    className="w-full px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Disconnect
                                </button>
                                <button
                                    type="button"
                                    onClick={reconnect}
                                    disabled={!isConnected}
                                    className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
                                >
                                    Reconnect
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
