import { bcs } from '@roochnetwork/rooch-sdk';

export interface Member {
  /** Member's wallet address */
  address: string;
  /** Member's avatar URL */
  avatar: string;
  /** Member's name */
  name?: string;
  /** Member's username */
  username?: string;
  /** Whether this member is the current agent */
  isAgent?: boolean;
}

export interface Channel {
  parentChannel: string | null;
  title: string;
  creator: string;
  membersTable: string;
  messageTable: string;
  message_counter: number;
  joinPolicy: number;
  createdAt: number;
  lastActive: number;
  status: number;
}

export const CHANNEL_STATUS = {
  ACTIVE: 0,
  CLOSED: 1,
  BANNED: 2,
} as const;

export const ChannelSchema = bcs.struct('Channel', {
  id: bcs.string(),
  title: bcs.string(),
  creator: bcs.string(),
  created_at: bcs.string(),
  last_active: bcs.string(),
  status: bcs.u8(),
  channel_type: bcs.u8(),
  message_counter: bcs.string(),
});
