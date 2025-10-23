import LiteLLMService from '../../src/services/litellm.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { LITELLM_PATHS } from '../../src/providers/constants.js';

/**
 * LiteLLM-specific test request configurations
 */
export interface LiteLLMChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // LiteLLM-specific parameters
  user?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  api_base?: string;
  api_version?: string;
}

/**
 * LiteLLM-specific test utilities
 * Thin wrapper around BaseProviderTestUtils for LiteLLM service
 */
export class LiteLLMTestUtils extends BaseProviderTestUtils {
  /**
   * Create a standard LiteLLM Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig {
    return {
      model: config.model || 'gpt-3.5-turbo',
      messages: config.messages || [{ role: 'user', content: 'Hello, this is a test message.' }],
      stream: config.stream || false,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 50,
      ...config,
    };
  }

  /**
   * Create a LiteLLM request with metadata and tags
   */
  static createChatCompletionWithMetadataRequest(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig {
    return {
      ...this.createChatCompletionRequest(config),
      user: config.user || 'test-user',
      metadata: {
        test_run: true,
        environment: 'integration-test',
        ...config.metadata,
      },
      tags: config.tags || ['test', 'integration'],
    };
  }

  /**
   * Test LiteLLM Chat Completions API
   * Thin wrapper that uses BaseProviderTestUtils.testNonStreamingRequest
   */
  static async testChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      user: config.user,
      metadata: config.metadata,
      tags: config.tags,
      ...config
    };

    return this.testNonStreamingRequest(provider, apiKey, LITELLM_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Test LiteLLM streaming Chat Completions
   * Thin wrapper that uses BaseProviderTestUtils.testStreamingRequest
   */
  static async testStreamingChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      user: config.user,
      metadata: config.metadata,
      tags: config.tags,
      stream: true,
      ...config
    };

    return this.testStreamingRequest(provider, apiKey, LITELLM_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Test LiteLLM with metadata and tags
   */
  static async testChatCompletionWithMetadata(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const metadataConfig = this.createChatCompletionWithMetadataRequest(config);
    return this.testChatCompletion(provider, apiKey, metadataConfig);
  }

  /**
   * Get common LiteLLM model names for testing
   */
  static getCommonModels(): string[] {
    return [
      'gpt-3.5-turbo',
      'gpt-4',
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'gemini-pro',
    ];
  }

  /**
   * Create requests for testing different models through LiteLLM
   */
  static createMultiModelTestRequests(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig[] {
    const models = this.getCommonModels();
    return models.map(model => this.createChatCompletionRequest({ ...config, model }));
  }

  /**
   * Test LiteLLM health endpoint
   */
  static async testHealth(
    provider: LiteLLMService,
    apiKey: string | null
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await provider.forwardRequest(apiKey, '/health', 'GET', undefined, false);
      const duration = Date.now() - startTime;

      if (!response) {
        return {
          success: false,
          error: 'No response received',
          duration,
        };
      }

      if ('error' in response) {
        return {
          success: false,
          error: response.error,
          statusCode: response.status,
          duration,
        };
      }

      const parsedResponse = provider.parseResponse(response);

      return {
        success: true,
        response: parsedResponse,
        duration,
        statusCode: response.status,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }
 
  /**
   * Wait for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
