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
 * Supports both static methods (backward compatibility) and instance methods (new design)
 */
export class LiteLLMTestUtils extends BaseProviderTestUtils<LiteLLMService> {
  /**
   * Constructor for instance-based testing
   * @param provider LiteLLM service instance
   * @param apiKey API key for LiteLLM
   */
  constructor(provider: LiteLLMService, apiKey: string | null) {
    super(provider, apiKey);
  }

  // ========== Instance Methods (New Design) ==========

  /**
   * Instance method: Test chat completion
   */
  async testChatCompletion(config: Partial<LiteLLMChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    return this.testNonStreaming(LITELLM_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test streaming chat completion
   */
  async testStreamingChatCompletion(config: Partial<LiteLLMChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };
    return this.testStreaming(LITELLM_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test chat completion with metadata
   */
  async testChatCompletionWithMetadata(config: Partial<LiteLLMChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      user: config.user || 'test-user',
      metadata: {
        test_run: true,
        environment: 'integration-test',
        ...config.metadata
      },
      tags: config.tags || ['test', 'integration'],
      ...config
    };
    return this.testNonStreaming(LITELLM_PATHS.CHAT_COMPLETIONS, options);
  }

  // ========== Static Methods (Backward Compatibility) ==========
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
   * Static method: Test LiteLLM Chat Completions API (backward compatibility)
   * @deprecated Use instance method testChatCompletion() instead
   */
  static async testChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new LiteLLMTestUtils(provider, apiKey);
    return instance.testChatCompletion(config);
  }

  /**
   * Static method: Test LiteLLM streaming Chat Completions (backward compatibility)
   * @deprecated Use instance method testStreamingChatCompletion() instead
   */
  static async testStreamingChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new LiteLLMTestUtils(provider, apiKey);
    return instance.testStreamingChatCompletion(config);
  }

  /**
   * Static method: Test LiteLLM with metadata and tags (backward compatibility)
   * @deprecated Use instance method testChatCompletionWithMetadata() instead
   */
  static async testChatCompletionWithMetadata(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new LiteLLMTestUtils(provider, apiKey);
    return instance.testChatCompletionWithMetadata(config);
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
}
