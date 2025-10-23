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
  async testChatCompletion(config: Partial<OpenRouterChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test streaming chat completion
   */
  async testStreamingChatCompletion(config: Partial<OpenRouterChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };
    return this.testStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test chat completion with routing
   */
  async testChatCompletionWithRouting(config: Partial<OpenRouterChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      route: 'fallback',
      models: config.models || ['openai/gpt-3.5-turbo', 'anthropic/claude-3-haiku'],
      ...config
    };
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test chat completion with referer
   */
  async testChatCompletionWithReferer(config: Partial<OpenRouterChatCompletionConfig> = {}, referer?: string): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    // Note: referer would be handled in headers, not in request body
    return this.testNonStreaming(OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  // ========== Static Methods (Backward Compatibility) ==========
  /**
   * Create a standard OpenRouter Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig {
    return {
      model: config.model || 'openai/gpt-3.5-turbo',
      messages: config.messages || [{ role: 'user', content: 'Hello, this is a test message.' }],
      stream: config.stream || false,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 50,
      ...config,
    };
  }

  /**
   * Create an OpenRouter request with routing preferences
   */
  static createChatCompletionWithRoutingRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig {
    return {
      ...this.createChatCompletionRequest(config),
      route: 'fallback',
      models: config.models || ['openai/gpt-3.5-turbo', 'anthropic/claude-3-haiku'],
      provider: {
        order: ['OpenAI', 'Anthropic'],
        allow_fallbacks: true,
        ...config.provider,
      },
    };
  }

  /**
   * Static method: Test OpenRouter Chat Completions API (backward compatibility)
   * @deprecated Use instance method testChatCompletion() instead
   */
  static async testChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenRouterTestUtils(provider, apiKey);
    return instance.testChatCompletion(config);
  }

  /**
   * Static method: Test OpenRouter streaming Chat Completions (backward compatibility)
   * @deprecated Use instance method testStreamingChatCompletion() instead
   */
  static async testStreamingChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenRouterTestUtils(provider, apiKey);
    return instance.testStreamingChatCompletion(config);
  }

  /**
   * Static method: Test OpenRouter with routing preferences (backward compatibility)
   * @deprecated Use instance method testChatCompletionWithRouting() instead
   */
  static async testChatCompletionWithRouting(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenRouterTestUtils(provider, apiKey);
    return instance.testChatCompletionWithRouting(config);
  }

  /**
   * Static method: Test OpenRouter with HTTP Referer header (backward compatibility)
   * @deprecated Use instance method testChatCompletionWithReferer() instead
   */
  static async testChatCompletionWithReferer(
    provider: OpenRouterService,
    apiKey: string | null,
    referer: string,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenRouterTestUtils(provider, apiKey);
    return instance.testChatCompletionWithReferer(config, referer);
  }

  /**
   * Get common OpenRouter model names for testing
   */
  static getCommonModels(): string[] {
    return [
      'openai/gpt-3.5-turbo',
      'openai/gpt-4',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-sonnet',
      'meta-llama/llama-2-70b-chat',
    ];
  }
}
