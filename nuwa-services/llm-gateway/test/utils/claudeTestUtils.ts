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

/**
 * Claude-specific test utilities
 * Thin wrapper around BaseProviderTestUtils for Claude provider
 */
export class ClaudeTestUtils extends BaseProviderTestUtils {
  /**
   * Test Claude message completion (non-streaming)
   * Thin wrapper that uses BaseProviderTestUtils.testNonStreamingRequest
   */
  static async testMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    const testOptions = {
      model: options.model,
      maxTokens: options.max_tokens,
      temperature: options.temperature,
      messages: options.messages,
    };

    return this.testNonStreamingRequest(provider, apiKey, CLAUDE_PATHS.MESSAGES, testOptions);
  }

  /**
   * Test Claude message completion (streaming)
   * Thin wrapper that uses BaseProviderTestUtils.testStreamingRequest
   */
  static async testStreamingMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    const testOptions = {
      model: options.model,
      maxTokens: options.max_tokens,
      temperature: options.temperature,
      messages: options.messages,
      stream: true,
    };

    return this.testStreamingRequest(provider, apiKey, CLAUDE_PATHS.MESSAGES, testOptions);
  }

  /**
   * Create test message for Claude API
   */
  static createTestMessage(content: string = 'Hello! Please respond briefly.') {
    return [{ role: 'user', content }];
  }

  /**
   * Get default Claude test options
   */
  static getDefaultOptions(): ClaudeTestOptions {
    return {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 100,
      temperature: 0.7
    };
  }
}
