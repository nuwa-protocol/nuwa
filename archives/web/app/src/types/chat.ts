import { Message } from './message';
import { Member } from "./channel";
import { QueryObserverResult } from "@tanstack/react-query";
import type { Agent } from "./agent";

export type MessageRole = 'user' | 'assistant'

export interface Topic {
  id: string
  title: string
  lastMessage: string
  timestamp: string
  unread: number
}

export interface ChatMember {
  id: string
  name: string
  avatar: string
  role: 'admin' | 'moderator' | 'member'
  status: 'online' | 'offline'
}

export interface ChatProps {
  messages: Message[]
  onSendMessage: (message: string) => void
  isLoading?: boolean
  onTopicClick?: (topicId: string) => void
}

export interface MessageProps {
  message: Message
  onTopicClick?: (topicId: string) => void
}

export interface Channel {
  id: string;
  title: string;
}

export interface AgentChatContextType {
  agent: Agent | undefined;
  isAgentPending: boolean;
  channels: Channel[] | undefined;
  isChannelsPending: boolean;
  refetchChannels: () => Promise<QueryObserverResult<Channel[], Error>>;
  members: Member[];
  memberCount: number | undefined;
  isJoined: boolean | undefined;
  refetchJoinStatus: () => Promise<QueryObserverResult<boolean, Error>>;
  refetchJoinedAgent: () => Promise<QueryObserverResult<Agent[] | undefined, Error>>;
  refetchChannelMembers: () => Promise<QueryObserverResult<Member[], Error>>;
  refetchMessageCount: () => Promise<QueryObserverResult<number, Error>>;
  refetchMessages: () => void;
  currentAddress: string | undefined;
  selectedChannel: string | undefined;
  setSelectedChannel: (channelId: string | undefined) => void;
  isAddressError: boolean;
} 