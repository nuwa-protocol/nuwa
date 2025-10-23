/**
 * Claude Test Utilities
 * Thin wrapper around BaseProviderTestUtils for Claude provider
 */

import { ClaudeProvider } from '../../src/providers/claude.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { CLAUDE_PATHS } from '../../src/providers/constants.js';

export interface ClaudeTestOptions {
  model: string;
  max_tokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
}

export interface ClaudeMessageConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
}

/**
 * Claude-specific test utilities
 * Supports both static methods (backward compatibility) and instance methods (new design)
 */
export class ClaudeTestUtils extends BaseProviderTestUtils<ClaudeProvider> {
  /**
   * Constructor for instance-based testing
   * @param provider Claude provider instance
   * @param apiKey API key for Claude
   */
  constructor(provider: ClaudeProvider, apiKey: string | null) {
    super(provider, apiKey);
  }

  // ========== Instance Methods (New Design) ==========

  /**
   * Instance method: Test message completion
   */
  async testMessageCompletion(config: Partial<ClaudeMessageConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config
    };
    return this.testNonStreaming(CLAUDE_PATHS.MESSAGES, options);
  }

  /**
   * Instance method: Test streaming message completion
   */
  async testStreamingMessageCompletion(config: Partial<ClaudeMessageConfig> = {}): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config
    };
    return this.testStreaming(CLAUDE_PATHS.MESSAGES, options);
  }

  // ========== Static Methods (Backward Compatibility) ==========
  /**
   * Static method: Test Claude message completion (backward compatibility)
   * @deprecated Use instance method testMessageCompletion() instead
   */
  static async testMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    const instance = new ClaudeTestUtils(provider, apiKey);
    const config = {
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages: options.messages,
    };
    return instance.testMessageCompletion(config);
  }

  /**
   * Static method: Test Claude streaming message completion (backward compatibility)
   * @deprecated Use instance method testStreamingMessageCompletion() instead
   */
  static async testStreamingMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    const instance = new ClaudeTestUtils(provider, apiKey);
    const config = {
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages: options.messages,
    };
    return instance.testStreamingMessageCompletion(config);
  }
}
