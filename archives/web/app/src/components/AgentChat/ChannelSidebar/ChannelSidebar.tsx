import { AgentInfo } from "./AgentInfo";
import { MembersList } from "./MembersList";
import { useAgentChat } from "../../../contexts/AgentChatContext";

/**
 * ChannelSidebar component - Displays channel information and member list
 * Features:
 * - Agent profile display
 * - Channel statistics
 * - Member list with avatars and addresses
 */
export function ChannelSidebar() {
  const { selectedChannel } = useAgentChat();

  if (!selectedChannel) {
    return null;
  }

  return (
    <div className="flex h-fit w-full flex-col border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:w-64 md:h-full md:border-l">
      {/* Agent profile section with stats */}
      <AgentInfo />
      {/* List of channel members */}
      <div className="flex-1 overflow-hidden">
        <MembersList />
      </div>
    </div>
  );
}
