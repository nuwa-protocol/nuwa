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

}

