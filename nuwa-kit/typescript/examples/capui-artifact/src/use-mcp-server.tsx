import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostMessageMCPTransport } from "@nuwa-ai/capui-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

interface LogEntry {
    timestamp: string;
    message: string;
}

export function useMcpServer() {
    const [status, setStatus] = useState<{
        message: string;
        isConnected: boolean;
    }>({
        message: "⏳ Starting up...",
        isConnected: false,
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const transportRef = useRef<PostMessageMCPTransport | null>(null);
    const serverRef = useRef<McpServer | null>(null);

    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message };
        setLogs((prev) => {
            const newLogs = [...prev, logEntry];
            return newLogs.length > 20 ? newLogs.slice(-20) : newLogs;
        });
    }, []);

    const updateStatus = useCallback((message: string, isConnected: boolean) => {
        setStatus({ message, isConnected });
    }, []);

    useEffect(() => {
        const initializeServer = async () => {
            try {
                addLog("🚀 Starting MCP server...");
                updateStatus("🔌 Initializing server...", false);

                // Create transport for child (connects to parent window)
                const transport = new PostMessageMCPTransport({
                    targetWindow: window.parent,
                    targetOrigin: "*",
                    allowedOrigins: ["*"],
                    debug: true,
                    timeout: 10000
                });
                transportRef.current = transport;

                // Create MCP server with tools
                const server = new McpServer({
                    name: "capui-demo-child",
                    version: "1.0.0"
                });
                serverRef.current = server;

                server.registerTool(
                    "get_secret",
                    {
                        title: "Get Secrete Tool",
                        "description": "Get the secrete",
                        inputSchema: {
                        }
                    },
                    async () => {
                        addLog(`🔧 Tool called: get_secret`);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Secret: Yes!`
                                }
                            ]
                        };
                    }
                );

                // Register tools using the registerTool method
                server.registerTool(
                    "get_weather",
                    {
                        title: "Weather Tool",
                        description: "Get weather information for a location",
                        inputSchema: {
                            location: z.string().describe("The location to get weather for")
                        }
                    },
                    async ({ location }) => {
                        addLog(`🔧 Tool called: get_weather`);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Weather in ${location}: Sunny, 22°C`
                                }
                            ]
                        };
                    }
                );

                server.registerTool(
                    "calculate",
                    {
                        title: "Calculator Tool",
                        description: "Perform mathematical calculations",
                        inputSchema: {
                            expression: z.string().describe("Mathematical expression to evaluate")
                        }
                    },
                    async ({ expression }) => {
                        addLog(`🔧 Tool called: calculate`);
                        try {
                            // Simple calculator - only allow basic math operations
                            const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
                            if (safeExpression !== expression) {
                                throw new Error("Invalid characters in expression");
                            }
                            const result = Function(`"use strict"; return (${safeExpression})`)();
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `${expression} = ${result}`
                                    }
                                ]
                            };
                        } catch (error) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `Error: ${error}`
                                    }
                                ]
                            };
                        }
                    }
                );

                server.registerTool(
                    "get_time",
                    {
                        title: "Time Tool",
                        description: "Get the current time",
                        inputSchema: {}
                    },
                    async () => {
                        addLog(`🔧 Tool called: get_time`);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Current time: ${new Date().toLocaleString()}`
                                }
                            ]
                        };
                    }
                );

                // Connect server to transport (this will handle transport connection)
                await server.connect(transport);
                addLog("✅ MCP server connected and ready");
                updateStatus("✅ Server ready - awaiting connections", true);

            } catch (error) {
                addLog(`❌ Server initialization failed: ${error}`);
                updateStatus(`❌ Server error: ${error}`, false);
                console.error("MCP server error:", error);
            }
        };

        initializeServer();

        // Cleanup on unmount
        return () => {
            if (serverRef.current) {
                serverRef.current.close();
            }
            if (transportRef.current) {
                transportRef.current.close();
            }
        };
    }, [addLog, updateStatus]);

    return {
        status,
        logs,
        server: serverRef.current,
        transport: transportRef.current,
    }
}