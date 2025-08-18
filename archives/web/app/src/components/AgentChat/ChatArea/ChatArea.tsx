import { MessageList } from "./Messages/MessageList";
import { MessageInput } from "./UserInput/MessageInput";
import { useAgentChat } from "@/contexts/AgentChatContext";
import { useState } from "react";

/**
 * Chat component - Main chat interface component
 * Features:
 * - Chat header with agent name
 * - Message list with auto-scrolling
 * - Message input with send/join functionality
 * - Token transfer functionality
 */
export function ChatArea() {
  const { agent, selectedChannel, channels } = useAgentChat();
  const [isAIThinking, setIsAIThinking] = useState(false);

  if (!agent || !selectedChannel) {
    return null;
  }

  const currentChannel = channels?.find(
    (channel) => channel.id === selectedChannel,
  );

  return (
    <div className="md:min-h-auto sticky top-0 z-10 flex h-full min-h-[60vh] flex-1 flex-col overflow-hidden bg-white dark:bg-gray-800 md:relative">
      {/* Chat header with agent name */}
      <div className="flex-none border-b border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentChannel?.title || "Unnamed Channel"}
            </h2>
            {isAIThinking && (
              <div className="flex items-center space-x-2 rounded-full bg-purple-100 px-3 py-1.5 text-purple-600 dark:bg-purple-700/40 dark:text-purple-300">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-purple-500"></div>
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message list with auto-scroll */}
      <div className="flex-1 md:overflow-hidden">
        <MessageList
          channelId={selectedChannel}
          agentName={agent.name}
          agentId={agent.id}
          agentAddress={agent.address}
          onAIThinkingChange={setIsAIThinking}
        />
      </div>

      {/* Message input and send/join button */}
      <div className="flex-none border-t border-gray-200 dark:border-gray-700">
        <MessageInput />
      </div>
    </div>
  );
}
