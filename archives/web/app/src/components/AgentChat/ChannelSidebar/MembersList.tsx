import { UserGroupIcon } from "@heroicons/react/24/outline";
import { RoochAddress, toShortStr } from "@roochnetwork/rooch-sdk";
import useUserInfo from "@/hooks/useUserInfo";
import { Member } from "@/types/channel";
import { Link } from "react-router-dom";
import { useAgentChat } from "@/contexts/AgentChatContext";

interface MemberItemProps {
  member: Member;
}

function MemberItem({ member }: MemberItemProps) {
  const { userInfo } = useUserInfo(member.address);
  const { agent } = useAgentChat();

  const avatar = member.isAgent
    ? agent?.avatar
    : userInfo?.avatar || member.avatar;
  const name = member.isAgent
    ? agent?.name
    : userInfo?.name ||
      toShortStr(new RoochAddress(member.address).toBech32Address());
  const username = member.isAgent
    ? agent?.username
    : userInfo?.username ||
      toShortStr(new RoochAddress(member.address).toBech32Address());

  const profileUrl = `/profile/${new RoochAddress(
    member.address,
  ).toBech32Address()}`;

  return (
    <Link
      to={profileUrl}
      className={`flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-700/50`}
    >
      <img src={avatar} alt={name} className="h-8 w-8 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center space-x-2">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {name}
          </p>
          {member.isAgent && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Agent
            </span>
          )}
        </div>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          @{username}
        </p>
      </div>
    </Link>
  );
}

/**
 * MembersList component - Displays the list of channel members
 * Features:
 * - Member avatars and addresses
 * - RGAS balance display
 * - Add member functionality (TODO)
 */
export function MembersList() {
  const { agent, members } = useAgentChat();
  const agentAddress = agent?.address ? new RoochAddress(agent.address) : null;

  // sort members list, put current agent at the first
  const sortedMembers = [...members].sort((a, b) => {
    // if no agent address, keep original order
    if (!agentAddress) return 0;

    const memberAddressA = new RoochAddress(a.address);
    const memberAddressB = new RoochAddress(b.address);

    if (memberAddressA.toBech32Address() === agentAddress.toBech32Address()) {
      return -1;
    }
    if (memberAddressB.toBech32Address() === agentAddress.toBech32Address()) {
      return 1;
    }
    return 0;
  });

  return (
    <div className="flex h-fit flex-col p-4 md:h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <UserGroupIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Members({members.length})
          </h3>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {sortedMembers.map((member) => {
          const isAgent = Boolean(
            agentAddress &&
              new RoochAddress(member.address).toBech32Address() ===
                agentAddress.toBech32Address(),
          );
          return (
            <MemberItem
              key={member.address}
              member={{
                ...member,
                isAgent,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
