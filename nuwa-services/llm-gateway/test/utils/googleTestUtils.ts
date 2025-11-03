/**
 * Google Gemini Test Utilities
 * Thin wrapper around BaseProviderTestUtils for Google provider
 */

import { GoogleProvider } from '../../src/providers/google.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { GOOGLE_PATHS } from '../../src/providers/constants.js';

export interface GoogleTestOptions {
  model: string;
  max_tokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
}

export interface GoogleGenerateContentConfig {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
}

/**
 * Google-specific test utilities
 * Supports both static methods (backward compatibility) and instance methods (new design)
 */
export class GoogleTestUtils extends BaseProviderTestUtils<GoogleProvider> {
  /**
   * Constructor for instance-based testing
   * @param provider Google provider instance
   * @param apiKey API key for Google
   */
  constructor(provider: GoogleProvider, apiKey: string | null) {
    super(provider, apiKey);
  }

  // ========== Instance Methods (New Design) ==========

  /**
   * Instance method: Test generateContent (non-streaming)
   */
  async testGenerateContent(
    config: Partial<GoogleGenerateContentConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config,
    };
    return this.testNonStreaming(GOOGLE_PATHS.GENERATE_CONTENT, options);
  }

  /**
   * Instance method: Test streamGenerateContent (streaming)
   */
  async testStreamGenerateContent(
    config: Partial<GoogleGenerateContentConfig> = {}
  ): Promise<BaseTestResult> {
    const options = {
      model: config.model,
      messages: config.messages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      stream: true,
      ...config,
    };
    return this.testStreaming(GOOGLE_PATHS.GENERATE_CONTENT, options);
  }

  /**
   * Instance method: Test multimodal content (text + image)
   */
  async testMultimodalContent(
    config: Partial<GoogleGenerateContentConfig> = {}
  ): Promise<BaseTestResult> {
    // Example base64 image - 1x1 red pixel PNG
    const base64Image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

    const multimodalMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What color is this image?' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
            },
          },
        ],
      },
    ];

    const options = {
      model: config.model || 'gemini-1.5-flash',
      messages: config.messages || multimodalMessages,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
      ...config,
    };

    return this.testNonStreaming(GOOGLE_PATHS.GENERATE_CONTENT, options);
  }
}
