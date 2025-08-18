import { LoadingScreen } from "@/components/layout/LoadingScreen";
import {
  AgentProfileProvider,
  useAgentProfile,
} from "@/components/profile/AgentProfileContext";
import useAddressByUsername from "@/hooks/useAddressByUsername";
import { useNetworkVariable } from "@/hooks/useNetworks";
import {
  ArrowLeftIcon,
  LockClosedIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { Args, RoochAddress } from "@roochnetwork/rooch-sdk";
import {
  SessionKeyGuard,
  useCurrentAddress,
  useRoochClient,
} from "@roochnetwork/rooch-sdk-kit";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { NotFound } from "./NotFound";
import { useLocalStorageState } from "ahooks";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ name: string; params: any }>;
}

interface ChatMessage {
  role: string;
  content: string;
}

function AgentDebuggerContent() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const client = useRoochClient();
  const currentAddress = useCurrentAddress();
  const packageId = useNetworkVariable("packageId");
  const { agent, isOwner, caps, updateAgent } = useAgentProfile();

  const [openaiApiKey, setOpenaiApiKey] = useLocalStorageState<
    string | undefined
  >("nuwa-openai-api-key", {
    defaultValue: "",
  });

  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(openaiApiKey);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [renderedPrompt, setRenderedPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [mockRgasAmount, setMockRgasAmount] = useState<string>("0");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Initialize prompt only once when agent is loaded
  useEffect(() => {
    if (agent?.instructions && agentPrompt === "") {
      setAgentPrompt(agent.instructions);
    }
  }, [agent]); // Remove agentPrompt from dependencies

  // Parse Actions from AI response
  const parseActions = (
    response: string,
  ): Array<{ name: string; params: any }> => {
    const actions: Array<{ name: string; params: any }> = [];
    const lines = response.split("\n");

    for (const line of lines) {
      const match = line.match(/^(\w+::\w+)\s+(.+)$/);
      if (match) {
        try {
          actions.push({
            name: match[1],
            params: JSON.parse(match[2]),
          });
        } catch (e) {
          console.warn("Failed to parse action:", line);
        }
      }
    }

    return actions;
  };

  // Extract response::say content from actions
  const extractResponseContent = (
    actions: Array<{ name: string; params: any }>,
  ): string => {
    const sayAction = actions.find((action) => action.name === "response::say");
    return sayAction?.params?.content || "";
  };

  // Convert RGAS float value to raw value (8 decimal places)
  const convertRgasToRaw = (amount: string): string => {
    try {
      // Parse the float value
      const floatValue = parseFloat(amount);
      if (isNaN(floatValue)) {
        throw new Error("Invalid number");
      }
      // Convert to raw value (multiply by 10^8)
      const rawValue = Math.floor(floatValue * 100000000).toString();
      return rawValue;
    } catch (e) {
      return "0";
    }
  };

  // Handle RGAS input change with validation
  const handleRgasInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string, numbers, and one decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setMockRgasAmount(value);
    }
  };

  // Call OpenAI API
  const handleTestWithOpenAI = async (chatRequest: any) => {
    if (!apiKey) {
      setError("Please enter OpenAI API Key");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Call OpenAI API directly with the chat request from contract
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(chatRequest),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      const actions = parseActions(aiResponse);
      const responseContent = extractResponseContent(actions);

      // Add assistant message with actions
      const assistantMessage: Message = {
        role: "assistant",
        content: responseContent,
        actions: actions.filter((action) => action.name !== "response::say"), // Store other actions
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setError(
        "Failed to call OpenAI API: " +
          (error instanceof Error ? error.message : String(error)),
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Handle sending a new message
  const handleSendMessage = async () => {
    if (!userInput.trim()) {
      return;
    }

    if (!currentAddress) {
      setError("Please connect your wallet");
      return;
    }

    if (!agent?.address) {
      setError("Agent address not found");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Add user message to chat
      const userMessage = { role: "user" as const, content: userInput };
      setMessages((prev) => [...prev, userMessage]);
      setUserInput(""); // Clear input after sending

      // Get current account address in bech32 format
      const userAddress = currentAddress.genRoochAddress().toBech32Address();
      const agentAddress = new RoochAddress(agent.address).toBech32Address();

      // Assemble DebugInput with the updated messages
      const debugInput = {
        instructions: agentPrompt,
        messages: [...messages, userMessage].map((msg, index) => ({
          index: index,
          // Use agent address for assistant messages, user address for user messages
          sender: msg.role === "assistant" ? agentAddress : userAddress,
          content: msg.content,
          timestamp: Date.now(),
          attachments: [],
        })),
        temperature: temperature,
        mock_rgas_amount: convertRgasToRaw(mockRgasAmount),
      };

      // Call contract to get chat request
      const response = await client.executeViewFunction({
        target: `${packageId}::agent_debugger::make_debug_ai_request`,
        args: [
          Args.objectId(agent.id || ""),
          Args.string(JSON.stringify(debugInput)),
        ],
      });
      console.log(response);

      if (!response.return_values?.[0]?.decoded_value) {
        throw new Error(
          "Failed to get response from contract: " + JSON.stringify(response),
        );
      }

      const chatRequestJson = response.return_values[0].decoded_value as string;
      const chatRequest = JSON.parse(chatRequestJson);
      // Extract the system prompt from the chat request
      const systemMessage = (chatRequest.messages as ChatMessage[]).find(
        (msg) => msg.role === "system",
      );
      if (!systemMessage?.content) {
        throw new Error("Invalid response format: missing system message");
      }
      setRenderedPrompt(systemMessage.content);
      // Call OpenAI API with the chat request
      await handleTestWithOpenAI(chatRequest);
    } catch (error) {
      console.error("Send message error:", error);
      setError(
        error instanceof Error ? error.message : "Failed to send message",
      );
      // Remove the user message if the request failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const validatePrompt = (prompt: string): string | null => {
    if (prompt.length > 4096) {
      return "Prompt cannot be longer than 4096 characters";
    }
    if (prompt.trim() && /^\s+$/.test(prompt)) {
      return "Prompt cannot only contain spaces";
    }
    return null;
  };

  const handleSavePrompt = async () => {
    if (!agent) return;

    const promptError = validatePrompt(agentPrompt);
    if (promptError) {
      // setFormErrors((prev) => ({
      //   ...prev,
      //   prompt: promptError,
      // }));
      return;
    }

    setIsSavingPrompt(true);
    try {
      await updateAgent({
        cap: caps.get(agent.id)!.id,
        instructions: agentPrompt,
      });

      toast.success("Agent prompt updated successfully!", {
        autoClose: 2000,
      });
    } catch (error) {
      toast.error("Failed to update agent prompt", {
        autoClose: 2000,
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Handle loading and error states
  if (!agent) {
    return <LoadingScreen agentName={identifier} />;
  }

  return (
    <>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              >
                <ArrowLeftIcon className="mr-2 h-5 w-5" />
                <span>Back</span>
              </button>
              <h1 className="ml-6 text-xl font-bold text-gray-900 dark:text-white">
                Debug {agent.name}'s Prompt
              </h1>
            </div>
            {isOwner ? (
              <SessionKeyGuard onClick={handleSavePrompt}>
                <button
                  disabled={isSavingPrompt}
                  className="flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  {isSavingPrompt ? (
                    <svg
                      className="mx-auto h-5 w-5 animate-spin text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      ></path>
                    </svg>
                  ) : (
                    <>
                      <PencilIcon className="mr-2 h-4 w-4" />
                      Save Prompt
                    </>
                  )}
                </button>
              </SessionKeyGuard>
            ) : (
              <div className="flex items-center text-gray-500 dark:text-gray-400">
                <LockClosedIcon className="mr-2 h-4 w-4" />
                <span className="text-sm">Only the owner can edit</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Prompt Editor */}
          <div className="flex w-1/2 flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-900 dark:text-red-100">
                  {error}
                </div>
              )}

              <div className="mb-4 flex items-center space-x-4">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setOpenaiApiKey(e.target.value);
                  }}
                  placeholder="Enter your OpenAI API Key"
                  className="w-80 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />

                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    Temperature:
                  </label>
                  <input
                    type="number"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    Mock RGas:
                  </label>
                  <input
                    type="text"
                    value={mockRgasAmount}
                    onChange={handleRgasInputChange}
                    placeholder="RGAS amount"
                    className="w-32 rounded-md border border-gray-300 px-2 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    RGAS
                  </span>
                </div>
              </div>

              {/* Prompt Editor */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Agent Prompt
                </label>
                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-transparent p-4 font-mono text-sm leading-relaxed text-gray-600 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:text-gray-300 dark:focus:border-purple-400"
                  placeholder="Enter the AI role prompt..."
                  rows={12}
                />
              </div>

              {/* Rendered Prompt */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Rendered Prompt
                </label>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-sm leading-relaxed text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                  {renderedPrompt}
                </pre>
              </div>
            </div>
          </div>

          {/* Right Panel - Chat */}
          <div className="flex w-1/2 flex-col overflow-hidden">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === "assistant"
                        ? "justify-start"
                        : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === "assistant"
                          ? "bg-gray-100 dark:bg-gray-700"
                          : "bg-blue-500 text-white"
                      }`}
                    >
                      <pre className="whitespace-pre-wrap font-mono text-sm">
                        {message.content}
                      </pre>
                      {message.role === "assistant" &&
                        message.actions &&
                        message.actions.length > 0 && (
                          <div className="mt-4 space-y-4">
                            {message.actions.map((action, actionIndex) => (
                              <div
                                key={actionIndex}
                                className="rounded-md border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
                              >
                                <h4 className="mb-2 font-medium text-blue-500 dark:text-blue-400">
                                  {action.name}
                                </h4>
                                <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">
                                  {JSON.stringify(action.params, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Input */}
            <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex gap-4">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Enter message..."
                  className="min-h-[80px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || !apiKey || loading}
                  className={`h-10 self-end rounded-md px-6 text-white ${
                    !userInput.trim() || !apiKey || loading
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-blue-500 hover:bg-blue-600"
                  }`}
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function AgentDebugger() {
  const { identifier } = useParams<{ identifier: string }>();
  const isAddress = (() => {
    try {
      if (!identifier) return false;
      new RoochAddress(identifier);
      return true;
    } catch {
      return false;
    }
  })();

  const {
    address,
    isPending: isAddressPending,
    isError: isAddressError,
  } = useAddressByUsername(!isAddress ? identifier : undefined);

  if (isAddressPending) {
    return <LoadingScreen agentName={identifier} />;
  }

  if (isAddressError || !address) {
    return <NotFound />;
  }

  return (
    <AgentProfileProvider address={address}>
      <AgentDebuggerContent />
    </AgentProfileProvider>
  );
}

export default AgentDebugger;
