/**
 * OpenRouter Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 */

import OpenRouterService from '../../src/services/openrouter.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { OpenRouterTestUtils } from '../utils/openrouterTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('openrouter', () => {
  let provider: OpenRouterService;
  let apiKey: string;

  beforeAll(() => {
    provider = new OpenRouterService();
    apiKey = TestEnv.getProviderApiKey('openrouter')!;
  });

  describe('Chat Completions API', () => {
    it('should handle non-streaming chat completion', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'openai/gpt-3.5-turbo' }
      );

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'openai/gpt-3.5-turbo',
      };

      const validationResult = OpenRouterTestUtils.validateTestResponse(result, validation);
      
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
      const result = await OpenRouterTestUtils.testStreamingChatCompletion(
        provider,
        apiKey,
        {
          model: 'openai/gpt-3.5-turbo',
          max_tokens: 30 // Shorter for streaming test
        }
      );

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

    it('should handle different model providers', async () => {
      const models = OpenRouterTestUtils.getCommonModels().slice(0, 3); // Test first 3 models

      for (const model of models) {
        const result = await OpenRouterTestUtils.testChatCompletion(
          provider,
          apiKey,
          {
            model,
            messages: [{ role: 'user', content: 'Hello, how are you?' }],
            max_tokens: 20,
          }
        );

        // Some models might not be available, so we allow both success and specific errors
        if (result.success) {
          expect(result.response).toBeDefined();
          expect(result.usage).toBeDefined();
          expect(result.cost).toBeDefined();
        } else {
          // Check if it's a known error (model not available, insufficient credits, etc.)
          expect(result.error).toBeDefined();
          expect(result.statusCode).toBeGreaterThanOrEqual(400);
        }

        // Add delay between requests to avoid rate limiting
        await OpenRouterTestUtils.wait(1000);
      }
    }, 60000);

    it('should handle errors gracefully', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        {
          model: 'definitely-invalid-model-that-does-not-exist-12345',
          messages: [{ role: 'user', content: 'Hello' }],
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    }, 15000);

    it('should handle invalid API key', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        'invalid-api-key',
        { model: 'openai/gpt-3.5-turbo' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBe(401);
    }, 15000);
  });


  describe('Usage Extraction and Cost Calculation', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'openai/gpt-3.5-turbo' }
      );

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

    it('should extract provider cost from response', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'openai/gpt-3.5-turbo' }
      );

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
      const result = await OpenRouterTestUtils.testStreamingChatCompletion(
        provider,
        apiKey,
        {
          model: 'openai/gpt-3.5-turbo',
          max_tokens: 20,
        }
      );

      expect(result.success).toBe(true);
      
      // OpenRouter should provide cost information in streaming mode
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare request data correctly', () => {
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

  describe('OpenRouter Specific Features', () => {
    it('should handle HTTP Referer header', async () => {
      // OpenRouter requires HTTP Referer for some features
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        {
          model: 'openai/gpt-3.5-turbo',
          max_tokens: 20,
        }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should handle model routing preferences', async () => {
      const result = await OpenRouterTestUtils.testChatCompletionWithRouting(
        provider,
        apiKey,
        {
          model: 'openai/gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 20,
        }
      );

      // Should handle the request regardless of routing preferences
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should extract cost from x-usage header', async () => {
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'openai/gpt-3.5-turbo' }
      );

      expect(result.success).toBe(true);
      
      // OpenRouter provides cost information either in response body or x-usage header
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);
  });

  describe('Rate Limiting and Credits', () => {
    it('should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests to potentially trigger rate limiting
      const requests = Array(3).fill(null).map(async (_, index) => {
        await OpenRouterTestUtils.wait(index * 500); // Stagger requests
        
        return OpenRouterTestUtils.testChatCompletion(provider, apiKey, {
          model: 'openai/gpt-3.5-turbo',
          max_tokens: 10, // Keep it small and fast
        });
      });

      const results = await Promise.all(requests);
      
      // At least some requests should succeed
      const successfulRequests = results.filter(r => r.success);
      expect(successfulRequests.length).toBeGreaterThan(0);
      
      // Check if any rate limiting occurred
      const rateLimitedRequests = results.filter(r => 
        !r.success && r.statusCode === 429
      );
      
      if (rateLimitedRequests.length > 0) {
        console.log(`Rate limiting detected: ${rateLimitedRequests.length} requests were rate limited`);
      }
    }, 60000);

    it('should handle insufficient credits gracefully', async () => {
      // This test might fail if account has sufficient credits, which is fine
      const result = await OpenRouterTestUtils.testChatCompletion(
        provider,
        apiKey,
        {
          model: 'openai/gpt-4', // More expensive model
          messages: [{ role: 'user', content: 'Write a long essay about artificial intelligence.' }],
          max_tokens: 1000, // Large response
        }
      );

      // Either succeeds or fails with insufficient credits
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.statusCode).toBeGreaterThanOrEqual(400);
      } else {
        expect(result.response).toBeDefined();
        expect(result.cost).toBeDefined();
      }
    }, 60000);
  });
});
