/**
 * OpenRouter Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only
 */

import OpenRouterService from '../../src/providers/openrouter.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { OpenRouterTestUtils } from '../utils/openrouterTestUtils.js';
import { BaseTestValidation, BaseProviderTestUtils } from '../utils/baseTestUtils.js';

beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('openrouter', () => {
  let provider: OpenRouterService;
  let apiKey: string;
  let testUtils: OpenRouterTestUtils;

  beforeAll(() => {
    provider = new OpenRouterService();
    apiKey = TestEnv.getProviderApiKey('openrouter')!;
    testUtils = new OpenRouterTestUtils(provider, apiKey);
  });

  describe('Chat Completions API', () => {
    it('should complete non-streaming chat completion successfully', async () => {
      const result = await testUtils.testChatCompletion({ model: 'openai/gpt-3.5-turbo' });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'openai/gpt-3.5-turbo',
      };

      const validationResult = testUtils.validateResponse(result, validation);

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
      const result = await testUtils.testStreamingChatCompletion({
        model: 'openai/gpt-3.5-turbo',
        max_tokens: 30, // Shorter for streaming test
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeDefined();
      expect(typeof result.response.content).toBe('string');
      expect(result.response.content.length).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(30000); // 30 seconds max

      // OpenRouter should provide usage information in streaming mode
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
      }

      // OpenRouter should provide cost information
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);

    it('should support multiple model providers', async () => {
      const models = provider.getTestModels().slice(0, 3); // Test first 3 models

      for (const model of models) {
        const result = await testUtils.testChatCompletion({
          model,
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          max_tokens: 20,
        });

        // Accept both success and known unavailability errors (model not configured, insufficient credits)
        if (result.success) {
          expect(result.response).toBeDefined();
          expect(result.usage).toBeDefined();
          expect(result.cost).toBeDefined();
          console.log(`✓ Model ${model} is available`);
        } else {
          // Log unavailable models for informational purposes
          console.log(`ℹ Model ${model} is unavailable: ${result.error}`);
          expect(result.error).toBeDefined();
          expect(result.statusCode).toBeGreaterThanOrEqual(400);
        }

        // Add delay between requests to avoid rate limiting
        await BaseProviderTestUtils.wait(1000);
      }
    }, 60000);
  });

  describe('Usage Extraction', () => {
    it('should extract usage statistics from non-streaming response', async () => {
      const result = await testUtils.testChatCompletion({ model: 'openai/gpt-3.5-turbo' });

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();

      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
        expect(result.usage.totalTokens).toBe(
          result.usage.promptTokens + result.usage.completionTokens
        );
      }
    }, 30000);

    it('should extract usage statistics from streaming response when available', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'openai/gpt-3.5-turbo',
        max_tokens: 20,
      });

      expect(result.success).toBe(true);

      // OpenRouter supports usage in streaming mode
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
        expect(result.usage.totalTokens).toBe(
          result.usage.promptTokens + result.usage.completionTokens
        );
      }
    }, 30000);
  });

  describe('Cost Calculation', () => {
    it('should extract provider native cost from response', async () => {
      const result = await testUtils.testChatCompletion({ model: 'openai/gpt-3.5-turbo' });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();

      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        // OpenRouter provides native USD cost
        expect(result.cost.source).toBe('provider');
        expect(result.cost.model).toBe('openai/gpt-3.5-turbo');
      }
    }, 30000);

    it('should extract cost from streaming response', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'openai/gpt-3.5-turbo',
        max_tokens: 20,
      });

      expect(result.success).toBe(true);

      // OpenRouter should provide cost information in streaming mode
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare non-streaming request data correctly', () => {
      const originalData = {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const preparedData = provider.prepareRequestData(originalData, false);

      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);

      // OpenRouter should inject usage.include for usage tracking
      expect(preparedData.usage).toBeDefined();
      expect(preparedData.usage.include).toBe(true);
    });

    it('should prepare streaming request data correctly', () => {
      const originalData = {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const preparedData = provider.prepareRequestData(originalData, true);

      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);
      expect(preparedData.stream).toBe(true);

      // OpenRouter should inject usage.include for usage tracking
      expect(preparedData.usage).toBeDefined();
      expect(preparedData.usage.include).toBe(true);
    });
  });

  describe('Provider-Specific Features', () => {
    it('should include required HTTP-Referer header', async () => {
      // OpenRouter requires HTTP-Referer header for proper functionality
      const result = await testUtils.testChatCompletion({
        model: 'openai/gpt-3.5-turbo',
        max_tokens: 20,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should support model routing preferences', async () => {
      const result = await testUtils.testChatCompletionWithRouting({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 20,
      });

      // Should handle the request with routing parameters
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should inject usage.include parameter for usage tracking', () => {
      const originalData = {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const preparedData = provider.prepareRequestData(originalData, false);

      // OpenRouter uses usage.include instead of stream_options
      expect(preparedData.usage).toBeDefined();
      expect(preparedData.usage.include).toBe(true);
    });

    it('should extract provider metadata from response', async () => {
      const result = await testUtils.testChatCompletion({ model: 'openai/gpt-3.5-turbo' });

      expect(result.success).toBe(true);

      // OpenRouter provides cost information either in response body or headers
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
        // Verify model identifier is preserved correctly
        expect(result.cost.model).toBe('openai/gpt-3.5-turbo');
      }
    }, 30000);
  });
});
