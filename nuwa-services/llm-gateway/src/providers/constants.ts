/**
 * Provider API path constants
 * These constants define the supported API paths for each provider
 */

export const OPENAI_PATHS = {
  CHAT_COMPLETIONS: '/v1/chat/completions',
  RESPONSES: '/v1/responses',
} as const;

// Add Google Gemini path constants
export const GEMINI_PATHS = {
  CHAT_COMPLETIONS: '/v1/models/{model}:generateContent',
  STREAM_CHAT_COMPLETIONS: '/v1/models/{model}:streamGenerateContent',
} as const;

export const OPENROUTER_PATHS = {
  CHAT_COMPLETIONS: '/api/v1/chat/completions',
} as const;

export const LITELLM_PATHS = {
  CHAT_COMPLETIONS: '/chat/completions',
} as const;

export const CLAUDE_PATHS = {
  MESSAGES: '/v1/messages',
} as const;

// Type helpers for better type safety
export type OpenAIPath = (typeof OPENAI_PATHS)[keyof typeof OPENAI_PATHS];
export type OpenRouterPath = (typeof OPENROUTER_PATHS)[keyof typeof OPENROUTER_PATHS];
export type LiteLLMPath = (typeof LITELLM_PATHS)[keyof typeof LITELLM_PATHS];
export type ClaudePath = (typeof CLAUDE_PATHS)[keyof typeof CLAUDE_PATHS];
export type GeminiPath = (typeof GEMINI_PATHS)[keyof typeof GEMINI_PATHS];

// All supported paths (for validation)
export const ALL_SUPPORTED_PATHS = [
  ...Object.values(OPENAI_PATHS),
  ...Object.values(OPENROUTER_PATHS),
  ...Object.values(LITELLM_PATHS),
  ...Object.values(CLAUDE_PATHS),
  ...Object.values(GEMINI_PATHS), // Add Gemini paths
] as const;
