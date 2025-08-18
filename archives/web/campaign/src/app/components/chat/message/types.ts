import { UIMessage } from 'ai';

export type MessageRole = 'user' | 'assistant' | 'system' | 'data';
export type MessagePartType = 'text' | 'tool-invocation' | 'source' | 'reasoning' | 'file' | 'step-start';

export interface MessagePart {
    type: MessagePartType;
    text?: string;
    toolInvocation?: any;
}

export interface MessageProps {
    message: UIMessage;
}

export interface ToolInvocationContentProps {
    toolInvocation: any;
}

export interface MessageContentProps {
    part: MessagePart;
}

export interface AvatarProps {
    role: MessageRole;
} 