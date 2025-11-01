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
      const result = await geminiUtils.testChatCompletion({ model: 'gemini-1.5-flash' });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gemini-1.5-flash',
      };

      const validationResult = geminiUtils.validateResponse(result, validation);

      if (!validationResult.valid) {
        console.error('Validation errors:', validationResult.errors);
        console.error('Test result:', result);
      }

      expect(validationResult.valid).toBe(true);
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.cost).toBeDefined();
      expect(result.cost?.costUsd).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(30000); // 30 seconds max
    }, 30000);

    it('should complete streaming chat completion successfully', async () => {
      const result = await geminiUtils.testStreamingChatCompletion({
        model: 'gemini-1.5-flash',
        max_tokens: 30, // Shorter for streaming test
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string' || 'object');
      expect(result.duration).toBeLessThan(30000); // 30 seconds max

      // Usage information might not be available in streaming mode for all providers
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
      }
    }, 30000);
  });
});
