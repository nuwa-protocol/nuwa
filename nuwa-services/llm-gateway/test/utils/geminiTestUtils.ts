import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { GEMINI_PATHS } from '../../src/providers/constants.js';
import { GeminiProvider } from '../../src/providers/gemini.js';

/**
 * Gemini-specific test request configurations
 */
export interface GeminiChatCompletionConfig {
  model: string;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Gemini-specific test utilities
 */
export class GeminiTestUtils extends BaseProviderTestUtils<GeminiProvider> {
  /**
   * Constructor for instance-based testing
   * @param provider Gemini provider instance
   * @param apiKey API key for Gemini
   */
  constructor(provider: GeminiProvider, apiKey: string | null) {
    super(provider, apiKey);
  }

  /**
   * Instance method: Test chat completion
   */
  async testChatCompletion(
    config: Partial<GeminiChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config,
    };

    // Build the endpoint with model name
    const model = options.model || 'gemini-2.0-flash-exp';
    const endpoint = GEMINI_PATHS.CHAT_COMPLETIONS.replace('{model}', model);

    return this.testNonStreaming(endpoint, options);
  }

  /**
   * Instance method: Test streaming chat completion
   */
  async testStreamingChatCompletion(
    config: Partial<GeminiChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config,
    };

    // Build the streaming endpoint with model name
    const model = options.model || 'gemini-2.0-flash-exp';
    const endpoint = GEMINI_PATHS.STREAM_CHAT_COMPLETIONS.replace('{model}', model);

    return this.testStreaming(endpoint, options);
  }
}
