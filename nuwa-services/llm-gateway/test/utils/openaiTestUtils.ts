import { OpenAIProvider } from '../../src/providers/openai.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { OPENAI_PATHS } from '../../src/providers/constants.js';

/**
 * OpenAI-specific test request configurations
 */
export interface OpenAIChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
}

export interface OpenAIResponseAPIConfig {
  model: string;
  input: string | Array<{ role: string; content: string }>;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    name: string;
    description: string;
    parameters: any;
  }>;
  max_output_tokens?: number;
}

/**
 * OpenAI-specific test utilities
 * Supports both static methods (backward compatibility) and instance methods (new design)
 */
export class OpenAITestUtils extends BaseProviderTestUtils<OpenAIProvider> {
  /**
   * Constructor for instance-based testing
   * @param provider OpenAI provider instance
   * @param apiKey API key for OpenAI
   */
  constructor(provider: OpenAIProvider, apiKey: string | null) {
    super(provider, apiKey);
  }

  // ========== Instance Methods (New Design) ==========

  /**
   * Instance method: Test chat completion
   */
  async testChatCompletion(config: Partial<OpenAIChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    return this.testNonStreaming(OPENAI_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test streaming chat completion
   */
  async testStreamingChatCompletion(config: Partial<OpenAIChatCompletionConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };
    return this.testStreaming(OPENAI_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Instance method: Test Response API
   */
  async testResponseAPI(config: Partial<OpenAIResponseAPIConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      input: config.input,
      maxTokens: config.max_output_tokens,
      ...config
    };
    return this.testNonStreaming(OPENAI_PATHS.RESPONSES, options);
  }

  /**
   * Instance method: Test streaming Response API
   */
  async testStreamingResponseAPI(config: Partial<OpenAIResponseAPIConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      input: config.input,
      maxTokens: config.max_output_tokens,
      stream: true,
      ...config
    };
    return this.testStreaming(OPENAI_PATHS.RESPONSES, options);
  }

  // ========== Static Methods (Backward Compatibility) ==========
  /**
   * Create a standard Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<OpenAIChatCompletionConfig> = {}): OpenAIChatCompletionConfig {
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
   * Create a Response API request
   */
  static createResponseAPIRequest(config: Partial<OpenAIResponseAPIConfig> = {}): OpenAIResponseAPIConfig {
    return {
      model: config.model || 'gpt-4o-mini',
      input: config.input || 'Hello, this is a test message for Response API.',
      stream: config.stream || false,
      max_output_tokens: config.max_output_tokens || 50,
      ...config,
    };
  }

  /**
   * Create a Chat Completions request with function tools
   */
  static createChatCompletionWithToolsRequest(config: Partial<OpenAIChatCompletionConfig> = {}): OpenAIChatCompletionConfig {
    const defaultTools = [{
      type: 'function' as const,
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            }
          },
          required: ['location']
        }
      }
    }];

    return {
      ...this.createChatCompletionRequest(config),
      tools: config.tools || defaultTools,
    };
  }

  /**
   * Create a Response API request with function tools
   */
  static createResponseAPIWithToolsRequest(config: Partial<OpenAIResponseAPIConfig> = {}): OpenAIResponseAPIConfig {
    const defaultTools = [{
      type: 'function' as const,
      name: 'get_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA'
          }
        },
        required: ['location']
      }
    }];

    return {
      ...this.createResponseAPIRequest(config),
      tools: config.tools || defaultTools,
    };
  }

  /**
   * Static method: Test OpenAI Chat Completions API (backward compatibility)
   * @deprecated Use instance method testChatCompletion() instead
   */
  static async testChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenAITestUtils(provider, apiKey);
    return instance.testChatCompletion(config);
  }

  /**
   * Static method: Test OpenAI Response API (backward compatibility)
   * @deprecated Use instance method testResponseAPI() instead
   */
  static async testResponseAPI(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIResponseAPIConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenAITestUtils(provider, apiKey);
    return instance.testResponseAPI(config);
  }

  /**
   * Static method: Test OpenAI streaming Chat Completions (backward compatibility)
   * @deprecated Use instance method testStreamingChatCompletion() instead
   */
  static async testStreamingChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const instance = new OpenAITestUtils(provider, apiKey);
    return instance.testStreamingChatCompletion(config);
  }
}

