import type { LanguageModelV1Message } from '@ai-sdk/provider';

export function convertToOpenRouterChatMessages(messages: LanguageModelV1Message[]): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}> {
  return messages.map(message => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system' as const,
          content:
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };
      case 'user':
        return {
          role: 'user' as const,
          content:
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };
      case 'assistant':
        return {
          role: 'assistant' as const,
          content:
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };
      default:
        throw new Error(`Unsupported message role: ${(message as any).role}`);
    }
  });
}
