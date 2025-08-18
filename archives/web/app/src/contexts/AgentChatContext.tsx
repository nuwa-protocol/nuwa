import useAddressByUsername from "@/hooks/useAddressByUsername";
import useAgent from "@/hooks/useAgent";
import useAgentChannel from "@/hooks/useAgentChannel";
import useAgentJoined from "@/hooks/useAgentJoined";
import useAgentWithAddress from "@/hooks/useAgentWithAddress";
import useChannelJoinedStatus from "@/hooks/useChannelJoinedStatus";
import useChannelMemberCount from "@/hooks/useChannelMemberCount";
import useChannelMembers from "@/hooks/useChannelMembers";
import useChannelMessageCount from "@/hooks/useChannelMessageCount";
import useChannelMessages from "@/hooks/useChannelMessages";
import { useCurrentAddress } from "@roochnetwork/rooch-sdk-kit";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { AgentChatContextType } from "../types/chat";

const AgentChatContext = createContext<AgentChatContextType | undefined>(
  undefined
);

export function AgentChatProvider({
  children,
  agentUsername,
}: {
  children: ReactNode;
  agentUsername: string;
}) {
  const { address, isError: isAddressError } =
    useAddressByUsername(agentUsername);
  const { agent } = useAgentWithAddress(address ?? undefined);
  const agentId = agent?.id ?? undefined;
  const { agent: agentDetails, isPending: isAgentPending } = useAgent(agentId);
  const {
    channels,
    isPending: isChannelsPending,
    refetch: refetchChannels,
  } = useAgentChannel(agentId);
  const [selectedChannel, setSelectedChannel] = useState<string>();
  const { memberCount } = useChannelMemberCount(
    selectedChannel || channels?.[0]?.id
  );
  const { members, refetch: refetchChannelMembers } = useChannelMembers({
    channelId: selectedChannel || channels?.[0]?.id,
    limit: "100",
  });
  const { isJoined, refetch: refetchJoinStatus } = useChannelJoinedStatus(
    selectedChannel || channels?.[0]?.id
  );
  const { refetch: refetchJoinedAgent } = useAgentJoined();
  const { refetch: refetchMessageCount } = useChannelMessageCount(
    selectedChannel || channels?.[0]?.id
  );
  const { refetch: refetchMessages } = useChannelMessages({
    channelId: selectedChannel || channels?.[0]?.id,
    page: 0,
    size: 100,
  });
  const currentAddress = useCurrentAddress();

  // Reset selectedChannel when agentId changes
  useEffect(() => {
    setSelectedChannel(undefined);
  }, [agent?.id]);

  useEffect(() => {
    if (!selectedChannel && channels && channels.length > 0) {
      setSelectedChannel(channels[0].id);
    }
  }, [channels, selectedChannel]);

  const value: AgentChatContextType = {
    agent: agentDetails,
    isAgentPending,
    channels,
    isChannelsPending,
    refetchChannels,
    members,
    memberCount,
    isJoined,
    refetchJoinStatus,
    refetchJoinedAgent,
    refetchChannelMembers,
    refetchMessageCount,
    refetchMessages,
    currentAddress: currentAddress?.genRoochAddress().toHexAddress(),
    selectedChannel,
    setSelectedChannel,
    isAddressError,
  };

  return (
    <AgentChatContext.Provider value={value}>
      {children}
    </AgentChatContext.Provider>
  );
}

export function useAgentChat() {
  const context = useContext(AgentChatContext);
  if (context === undefined) {
    throw new Error("useAgentChat must be used within an AgentChatProvider");
  }
  return context;
}
