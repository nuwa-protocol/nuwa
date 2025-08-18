import {
  UserCircleIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import useAgentBalance from "@/hooks/useAgentBalance";
import { useChannelLeave } from "@/hooks/useChannelLeave";
import useChannelJoinedStatus from "@/hooks/useChannelJoinedStatus";
import useAgentJoined from "@/hooks/useAgentJoined";
import useChannelMembers from "@/hooks/useChannelMembers";
import { useAgentChat } from "@/contexts/AgentChatContext";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { formatAmountDisplay } from "@/utils/amount";

/**
 * AgentProfile component - Displays agent information and channel statistics
 * Features:
 * - Agent avatar and name
 * - Channel member count
 * - Agent balance
 * - Profile navigation button
 */
export function AgentInfo() {
  const navigate = useNavigate();
  const { agent, selectedChannel, memberCount } = useAgentChat();
  const { balance, isPending: isBalancePending } = useAgentBalance(
    agent?.agent_address,
  );

  const { isJoined, refetch: refetchIsjoined } = useChannelJoinedStatus(
    selectedChannel || "",
  );
  const { refetch: refetchJoinedAgent } = useAgentJoined();
  const { refetch: refetchChannelMembers } = useChannelMembers({
    channelId: selectedChannel || "",
    limit: "100",
  });
  const { mutateAsync: leaveChannel, isPending: leaveIsPending } =
    useChannelLeave();

  const handleLeaveChannel = async () => {
    if (!selectedChannel) {
      return;
    }
    leaveChannel({
      id: selectedChannel,
    }).finally(() => {
      refetchIsjoined();
      refetchJoinedAgent();
      refetchChannelMembers();
    });
  };

  if (!agent) {
    return (
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <div className="rounded-lg bg-gray-50 p-3 text-center text-gray-500 dark:bg-gray-800/50">
          No agent information available
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-col space-y-4">
        {/* Header Section with Avatar and Basic Info */}
        <div className="flex items-start space-x-4">
          {/* Avatar Section */}
          <div className="relative">
            <img
              src={
                agent.avatar ||
                "https://api.dicebear.com/7.x/bottts/svg?seed=" + agent.id
              }
              alt="AI Avatar"
              className="h-16 w-16 rounded-full ring-2 ring-purple-100 dark:ring-purple-900/30"
            />
          </div>

          {/* Basic Info Section */}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {agent.name}
            </h2>
            <div className="text-sm text-purple-600 dark:text-purple-400">
              @{agent.username}
            </div>
          </div>
        </div>

        {/* Description Section */}
        {agent.description && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {agent.description}
          </div>
        )}

        {/* Stats Section */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <UserGroupIcon className="mr-1 h-4 w-4" />
            <span>{memberCount || 0}</span>
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <CurrencyDollarIcon className="mr-1 h-4 w-4" />
            {isBalancePending ? (
              <span className="animate-pulse">...</span>
            ) : (
              <span>
                {formatAmountDisplay(Number(balance?.balance || 0) / 1e8)} RGAS
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => navigate(`/profile/${agent.agent_address}`)}
            className="flex w-full items-center justify-center space-x-2 rounded-lg bg-purple-50 px-4 py-2 text-purple-700 transition-colors hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
          >
            <UserCircleIcon className="h-5 w-5" />
            <span className="font-medium">View Profile</span>
          </button>

          {isJoined && (
            <SessionKeyGuard onClick={handleLeaveChannel}>
              <button className="flex w-full items-center justify-center space-x-2 rounded-lg bg-red-50 px-4 py-2 text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30">
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                <span className="font-medium">
                  {leaveIsPending ? "Leaving..." : "Leave Channel"}
                </span>
              </button>
            </SessionKeyGuard>
          )}
        </div>
      </div>
    </div>
  );
}
