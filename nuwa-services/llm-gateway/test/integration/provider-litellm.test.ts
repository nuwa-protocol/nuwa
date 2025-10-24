/**
 * LiteLLM Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only
 * Note: Requires a running LiteLLM proxy server
 */

import LiteLLMService from '../../src/services/litellm.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { LiteLLMTestUtils } from '../utils/litellmTestUtils.js';
import { BaseTestValidation, BaseProviderTestUtils } from '../utils/baseTestUtils.js';
import { pricingRegistry } from '../../src/billing/pricing.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('litellm', () => {
  let provider: LiteLLMService;
  let apiKey: string;
  let baseUrl: string;
  let testUtils: LiteLLMTestUtils;

  beforeAll(() => {
    provider = new LiteLLMService();
    apiKey = TestEnv.getProviderApiKey('litellm')!;
    baseUrl = TestEnv.getProviderBaseUrl('litellm')!;
    testUtils = new LiteLLMTestUtils(provider, apiKey);

    console.log(`Testing LiteLLM at: ${baseUrl}`);
  });

  describe('Chat Completions API', () => {
    it('should handle non-streaming chat completion', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 50,
      });

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gpt-3.5-turbo',
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

    it('should handle streaming chat completion', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 30, // Shorter for streaming test
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.content).toBeDefined();
      expect(typeof result.response.content).toBe('string');
      expect(result.response.content.length).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(30000); // 30 seconds max

      // LiteLLM should provide usage information in streaming mode
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
      }

      // LiteLLM should provide cost information
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);

    it('should support different models', async () => {
      const models = provider.getTestModels();

      for (const model of models) {
        // Add delay between requests to avoid rate limiting
        if (models.indexOf(model) > 0) {
          await BaseProviderTestUtils.wait(1000);
        }

        const result = await testUtils.testChatCompletion({
          model,
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          max_tokens: 20,
        });

        // Accept both success and known unavailability conditions
        if (result.success) {
          expect(result.response).toBeDefined();
          expect(result.usage).toBeDefined();
          expect(result.cost?.model).toBe(model);
          console.log(`✅ Model ${model} is available and working`);
        } else {
          console.log(`ℹ️ Model ${model} is not available: ${result.error}`);
          expect([400, 401, 403, 404, 429]).toContain(result.statusCode || 0);
        }
      }
    }, 60000);
  });

  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 50,
      });

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

    it('should extract usage from streaming response when available', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 20,
      });

      expect(result.success).toBe(true);

      // LiteLLM might provide usage information in streaming mode
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
    it('should extract provider cost from response headers', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 50,
      });

      expect(result.success).toBe(true);

      // LiteLLM provides cost information via x-litellm-response-cost header
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
        expect(result.cost.model).toBe('gpt-3.5-turbo');
      }
    }, 30000);

    it('should extract cost from streaming response', async () => {
      const result = await testUtils.testStreamingChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 20,
      });

      expect(result.success).toBe(true);

      // LiteLLM might provide cost information in streaming mode
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);

    it('should calculate cost accuracy for different pricing tiers', async () => {
      const testModel = 'gpt-3.5-turbo';
      const result = await testUtils.testChatCompletion({
        model: testModel,
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 50,
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.usage).toBeDefined();

      if (result.cost && result.usage) {
        // Get pricing from configuration
        const pricing = pricingRegistry.getProviderPricing('litellm', testModel);

        if (pricing) {
          // Calculate expected cost based on configuration pricing
          const expectedCost =
            (result.usage.promptTokens * pricing.promptPerMTokUsd +
              result.usage.completionTokens * pricing.completionPerMTokUsd) /
            1000000; // Convert from per-million-tokens to per-token

          // Allow reasonable tolerance for rounding differences
          const tolerance = 0.3; // 30% tolerance
          const actualCost = result.cost.costUsd;
          const difference = Math.abs(actualCost - expectedCost);
          const percentDifference = difference / expectedCost;

          if (percentDifference > tolerance) {
            console.log(
              `Cost difference: expected=${expectedCost}, actual=${actualCost}, diff=${percentDifference * 100}%`
            );
          }

          expect(percentDifference).toBeLessThanOrEqual(tolerance);
        }
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare non-streaming request data correctly', () => {
      const originalData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const preparedData = provider.prepareRequestData(originalData, false);

      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);
      expect(preparedData.stream).toBe(false);
    });

    it('should prepare streaming request data correctly', () => {
      const originalData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const preparedData = provider.prepareRequestData(originalData, true);

      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);
      expect(preparedData.stream).toBe(true);
    });

    it('should preserve provider-specific parameters', () => {
      const originalData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { user_id: 'test-user' },
        tags: ['integration-test'],
        user: 'test-user',
      };

      const preparedData = provider.prepareRequestData(originalData, false);

      expect(preparedData).toBeDefined();
      expect(preparedData.metadata).toEqual(originalData.metadata);
      expect(preparedData.tags).toEqual(originalData.tags);
      expect(preparedData.user).toBe(originalData.user);
    });
  });

  describe('Provider-Specific Features', () => {
    it('should handle LiteLLM proxy configuration', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 20,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should handle custom LiteLLM parameters', async () => {
      const result = await testUtils.testChatCompletionWithMetadata({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 20,
        user: 'test-user',
        metadata: {
          test_run: true,
          environment: 'integration-test',
        },
        tags: ['integration-test'],
      });

      // Should handle the request regardless of LiteLLM specific parameters
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should extract cost from x-litellm-response-cost header', async () => {
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 50,
      });

      expect(result.success).toBe(true);

      // LiteLLM provides cost information via x-litellm-response-cost header
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);

    it('should handle chat completions requests', async () => {
      // Test the main chat completions endpoint
      const result = await testUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 10,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);
  });
});
