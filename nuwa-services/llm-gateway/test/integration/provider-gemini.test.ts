/**
 * Google Gemini Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 */

import { GeminiProvider } from '../../src/providers/gemini.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { GeminiTestUtils } from '../utils/geminiTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('gemini', () => {
  let provider: GeminiProvider;
  let apiKey: string;
  let geminiUtils: GeminiTestUtils;

  beforeAll(() => {
    provider = new GeminiProvider();
    apiKey = TestEnv.getProviderApiKey('gemini')!;
    geminiUtils = new GeminiTestUtils(provider, apiKey);
  });

  describe('Chat Completions API', () => {
    it('should complete non-streaming chat completion successfully', async () => {
      const result = await geminiUtils.testChatCompletion({ model: 'gemini-2.0-flash-exp' });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        // usage/cost extraction may vary depending on Gemini response; do not hard-require here
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gemini-2.0-flash-exp',
      };

      const validationResult = geminiUtils.validateResponse(result, validation);

      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();

      // Gemini non-streaming response should include candidates with text content
      const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);

      // Usage and cost may or may not be present depending on provider response shape
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
      }
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
      }

      expect(result.duration).toBeLessThan(30000); // 30 seconds max
    }, 30000);

    it('should complete streaming chat completion successfully', async () => {
      const result = await geminiUtils.testStreamingChatCompletion({
        model: 'gemini-2.0-flash-exp',
        max_tokens: 30, // Shorter for streaming test
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeDefined();
      expect(typeof result.response.content).toBe('string');
      expect(result.response.content.length).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(30000); // 30 seconds max

      // Usage information might not be available in streaming mode for all providers
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
      }
    }, 30000);
  });
});
