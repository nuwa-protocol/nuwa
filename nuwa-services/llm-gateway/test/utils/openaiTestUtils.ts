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
 * Thin wrapper around BaseProviderTestUtils for OpenAI provider
 */
export class OpenAITestUtils extends BaseProviderTestUtils {
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
   * Test OpenAI Chat Completions API
   * Thin wrapper that uses BaseProviderTestUtils.testNonStreamingRequest
   */
  static async testChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    // Use provider's createTestRequest to build the proper request format
    // Then delegate to base utils for execution
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    
    return this.testNonStreamingRequest(provider, apiKey, OPENAI_PATHS.CHAT_COMPLETIONS, options);
  }

  /**
   * Test OpenAI Response API
   * Thin wrapper that uses BaseProviderTestUtils.testNonStreamingRequest
   */
  static async testResponseAPI(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIResponseAPIConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      input: config.input,
      maxTokens: config.max_output_tokens,
      ...config
    };
    
    return this.testNonStreamingRequest(provider, apiKey, OPENAI_PATHS.RESPONSES, options);
  }

  /**
   * Test OpenAI streaming Chat Completions
   * Thin wrapper that uses BaseProviderTestUtils.testStreamingRequest
   */
  static async testStreamingChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };
    
    return this.testStreamingRequest(provider, apiKey, OPENAI_PATHS.CHAT_COMPLETIONS, options);
  }
}

