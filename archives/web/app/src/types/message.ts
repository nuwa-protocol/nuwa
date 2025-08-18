export interface Attachment {
  attachment_type: number;
  attachment_json: string;
}

export interface Message {
  index: number;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: number;
  message_type: number;
  mentions: string[];
  reply_to: number;
  attachments: Attachment[];
}

export interface MessageSendParams {
  channelId: string;
  content: string;
  mentions: string[];
  replyTo?: number;
}

export const MESSAGE_TYPE = {
  NORMAL: 0,
  ACTION_EVENT: 1,
  SYSTEM_EVENT: 2,
} as const;

export interface TransferAttachment {
  amount: string;
  coin_type: string;
  to: string;
  memo?: string;
}

export interface ActionEvent {
  action: string;
  args: string;
  success: boolean;
  error?: string;
}
export interface ChatMessageProps {
  message: Message;
  isCurrentUser: boolean;
  isAI: boolean;
  agentName?: string;
  agentId?: string;
  hasPaidContent?: boolean;
  messages?: Message[];
}
