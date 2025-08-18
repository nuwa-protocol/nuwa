import { useAgentChat } from "@/contexts/AgentChatContext";
import { useChannelCreateTopic } from "@/hooks/useChannelCreateTopic";
import { ChatBubbleLeftIcon, PlusIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { useState } from "react";

/**
 * Props for the DialogSidebar component
 */
interface DialogSidebarProps {
  /** Current channel ID */
  channels: {
    title: string;
    id: string;
  }[];
  onChannelSelect: (id: string) => void;
  /** Callback to refresh the dialog list */
  onRefresh: () => void;
}

/**
 * DialogSidebar component - Displays the list of available dialogs
 * Features:
 * - List of chat dialogs
 * - Unread message indicators
 * - Active dialog highlighting
 */
export function DialogSidebar({
  channels,
  onChannelSelect,
  onRefresh,
}: DialogSidebarProps) {
  const { mutateAsync, isPending } = useChannelCreateTopic();
  const [showInput, setShowInput] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { selectedChannel } = useAgentChat();

  const validateTopicName = (name: string): string | null => {
    if (!name.trim()) {
      return "Topic name cannot be empty";
    }
    if (name.length > 50) {
      return "Topic name cannot exceed 50 characters";
    }
    if (name.includes("\n")) {
      return "Topic name cannot contain line breaks";
    }
    if (/^\s+$/.test(name)) {
      return "Topic name cannot contain only whitespace";
    }
    return null;
  };

  const handleCreateTopic = async () => {
    const validationError = validateTopicName(topicName);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await mutateAsync({
        channelId: channels[0].id,
        topic: topicName,
        joinPolicy: 0, // all topics are public
      });
      console.log("Topic created successfully");
      setShowInput(false);
      setTopicName("");
      setError(null);
      onRefresh(); // refresh the dialog list
    } catch (error) {
      console.error("Error creating topic:", error);
      setError("Failed to create topic");
    }
  };

  return (
    <div className="w-full border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:w-64">
      {/* Dialog list header */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Dialog List
          </h2>
          <SessionKeyGuard onClick={() => setShowInput(true)}>
            <button
              disabled={isPending}
              className={`rounded-lg p-2 transition-colors ${
                isPending
                  ? "cursor-not-allowed bg-purple-100 text-purple-400 dark:bg-purple-900/30 dark:text-purple-500"
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
              }`}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </SessionKeyGuard>
        </div>
        {showInput && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={topicName}
              onChange={(e) => {
                setTopicName(e.target.value);
                setError(null);
              }}
              placeholder="Enter topic name"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateTopic}
                disabled={isPending || !topicName.trim()}
                className="flex-1 rounded-lg bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowInput(false);
                  setTopicName("");
                  setError(null);
                }}
                className="flex-1 rounded-lg bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Scrollable list of dialogs */}
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
        {/* Single dialog item */}
        {channels.map((channel) => (
          <div
            key={channel.id}
            className={`cursor-pointer border-b px-4 py-2.5 transition-colors dark:border-gray-700 ${
              selectedChannel === channel.id
                ? "border-l-4 border-l-purple-500 dark:border-l-purple-400"
                : "hover:border-l-4 hover:border-l-purple-300 dark:hover:border-l-purple-500"
            }`}
            onClick={() => onChannelSelect(channel.id)}
          >
            <div className="hover:ring-none flex w-full items-center space-x-3 bg-transparent hover:border-none">
              <ChatBubbleLeftIcon
                className={`h-5 w-4 ${
                  selectedChannel === channel.id
                    ? "text-purple-600 dark:text-purple-400"
                    : "text-gray-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    selectedChannel === channel.id
                      ? "text-purple-700 dark:text-purple-300"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {channel.title}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
