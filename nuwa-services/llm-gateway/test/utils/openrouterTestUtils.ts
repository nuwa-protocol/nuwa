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
 * Thin wrapper around BaseProviderTestUtils for OpenRouter service
 */
export class OpenRouterTestUtils extends BaseProviderTestUtils {
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
   * Test OpenRouter Chat Completions API
   * Thin wrapper that uses BaseProviderTestUtils.testNonStreamingRequest
   */
  static async testChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };

    return this.testNonStreamingRequest(provider, apiKey, OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Test OpenRouter streaming Chat Completions
   * Thin wrapper that uses BaseProviderTestUtils.testStreamingRequest
   */
  static async testStreamingChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };

    return this.testStreamingRequest(provider, apiKey, OPENROUTER_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Test OpenRouter with routing preferences
   */
  static async testChatCompletionWithRouting(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const routingConfig = this.createChatCompletionWithRoutingRequest(config);
    return this.testChatCompletion(provider, apiKey, routingConfig);
  }

  /**
   * Test OpenRouter with HTTP Referer header (required for some features)
   */
  static async testChatCompletionWithReferer(
    provider: OpenRouterService,
    apiKey: string | null,
    referer: string,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    // This would require modifying the provider to accept custom headers
    // For now, we'll use the standard test but note the limitation
    console.warn('⚠️  HTTP Referer header testing requires provider modification');
    return this.testChatCompletion(provider, apiKey, config);
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

  /**
   * Create a request for testing different model providers
   */
  static createMultiProviderTestRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig[] {
    const models = this.getCommonModels();
    return models.map(model => this.createChatCompletionRequest({ ...config, model }));
  }
}
