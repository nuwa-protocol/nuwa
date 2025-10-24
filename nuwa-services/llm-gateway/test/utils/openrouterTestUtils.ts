import OpenRouterService from '../../src/services/openrouter.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { OPENROUTER_PATHS } from '../../src/providers/constants.js';

/**
 * OpenRouter-specific test request configurations
 */
export interface OpenRouterChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // OpenRouter-specific parameters
  route?: 'fallback';
  transforms?: string[];
  models?: string[];
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
  };
}

/**
 * OpenRouter-specific test utilities
 * Supports both static methods (backward compatibility) and instance methods (new design)
 */
export class OpenRouterTestUtils extends BaseProviderTestUtils<OpenRouterService> {
  /**
   * Constructor for instance-based testing
   * @param provider OpenRouter service instance
   * @param apiKey API key for OpenRouter
   */
  constructor(provider: OpenRouterService, apiKey: string | null) {
    super(provider, apiKey);
  }

  // ========== Instance Methods (New Design) ==========

  /**
   * Instance method: Test chat completion
   */
  async testChatCompletion(
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config,
    };
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test streaming chat completion
   */
  async testStreamingChatCompletion(
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config,
    };
    return this.testStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test chat completion with routing
   */
  async testChatCompletionWithRouting(
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      route: 'fallback',
      models: config.models || ['openai/gpt-3.5-turbo', 'anthropic/claude-3-haiku'],
      ...config,
    };
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test chat completion with referer
   */
  async testChatCompletionWithReferer(
    config: Partial<OpenRouterChatCompletionConfig> = {},
    referer?: string
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config,
    };
    // Note: referer would be handled in headers, not in request body
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }
}
