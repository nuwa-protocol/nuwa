import type { LanguageModelV1Message } from '@ai-sdk/provider';

export function convertToOpenRouterCompletionPrompt(messages: LanguageModelV1Message[]): string {
  return messages
    .map(message => {
      switch (message.role) {
        case 'system':
          return `System: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`;
        case 'user':
          return `User: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`;
        case 'assistant':
          return `Assistant: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`;
        default:
          throw new Error(`Unsupported message role: ${(message as any).role}`);
      }
    })
    .join('\n\n');
}
