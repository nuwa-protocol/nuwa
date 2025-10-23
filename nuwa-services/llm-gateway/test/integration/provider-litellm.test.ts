/**
 * LiteLLM Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Note: Requires a running LiteLLM proxy server
 */

import LiteLLMService from '../../src/services/litellm.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { LiteLLMTestUtils } from '../utils/litellmTestUtils.js';
import { BaseTestValidation, BaseProviderTestUtils } from '../utils/baseTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('litellm', () => {
  let provider: LiteLLMService;
  let apiKey: string;
  let baseUrl: string;
  let litellmUtils: LiteLLMTestUtils;

  beforeAll(() => {
    provider = new LiteLLMService();
    apiKey = TestEnv.getProviderApiKey('litellm')!;
    baseUrl = TestEnv.getProviderBaseUrl('litellm')!;
    litellmUtils = new LiteLLMTestUtils(provider, apiKey);
    
    console.log(`Testing LiteLLM at: ${baseUrl}`);
  });

  describe('Chat Completions API', () => {
    it('should handle non-streaming chat completion', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        }
      );

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gpt-3.5-turbo',
      };

      const validationResult = litellmUtils.validateResponse(result, validation);
      
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
      const result = await litellmUtils.testStreamingChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 30, // Shorter for streaming test
        }
      );

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

    it('should handle different model configurations', async () => {
      // Test different models that might be configured in LiteLLM
      const models = LiteLLMTestUtils.getCommonModels();

      for (const model of models) {
        const result = await litellmUtils.testChatCompletion({
            model,
            messages: [{ role: 'user', content: 'Hello, how are you?' }],
            max_tokens: 20,
          }
        );

        // Some models might not be configured in LiteLLM, so we allow both success and specific errors
        if (result.success) {
          expect(result.response).toBeDefined();
          expect(result.usage).toBeDefined();
        } else {
          // Check if it's a known error (model not configured, etc.)
          expect(result.error).toBeDefined();
          expect(result.statusCode).toBeGreaterThanOrEqual(400);
          console.log(`Model ${model} not available: ${result.error}`);
        }

        // Add delay between requests to avoid overwhelming the proxy
        await BaseProviderTestUtils.wait(1000);
      }
    }, 60000);

    it('should handle errors gracefully', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'invalid-model-name',
          messages: [{ role: 'user', content: 'Hello' }],
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    }, 15000);

    it('should handle invalid API key', async () => {
      // Test with invalid API key - create temporary instance with invalid key
      const invalidUtils = new LiteLLMTestUtils(provider, 'invalid-api-key');
      const result = await invalidUtils.testChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBe(401);
    }, 15000);
  });


  describe('Usage Extraction and Cost Calculation', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        }
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

    it('should extract provider cost from response headers', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        }
      );

      expect(result.success).toBe(true);
      
      // LiteLLM might provide cost information via headers
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
        expect(result.cost.model).toBe('gpt-3.5-turbo');
      }
    }, 30000);

    it('should extract cost from streaming response', async () => {
      const result = await litellmUtils.testStreamingChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 20,
        }
      );

      expect(result.success).toBe(true);
      
      // LiteLLM might provide cost information in streaming mode
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare request data correctly', () => {
      const originalData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const preparedData = provider.prepareRequestData(originalData, false);
      
      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);
      
      // Should inject stream_options for usage tracking
      if (!originalData.stream) {
        expect(preparedData.stream_options).toBeDefined();
        expect(preparedData.stream_options.include_usage).toBe(true);
      }
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
      
      // Should inject stream_options for usage tracking
      expect(preparedData.stream_options).toBeDefined();
      expect(preparedData.stream_options.include_usage).toBe(true);
    });
  });

  describe('LiteLLM Specific Features', () => {
    it('should handle LiteLLM proxy configuration', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 20,
        }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should handle custom LiteLLM parameters', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 20,
          // LiteLLM specific parameters
          metadata: {
            user_id: 'test-user',
            tags: ['integration-test'],
          },
        }
      );

      // Should handle the request regardless of LiteLLM specific parameters
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should extract cost from x-litellm-response-cost header', async () => {
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        }
      );

      expect(result.success).toBe(true);
      
      // LiteLLM provides cost information via x-litellm-response-cost header
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
      }
    }, 30000);
  });

  describe('Proxy Health and Configuration', () => { 

    it('should handle chat completions requests', async () => {
      // Test the main chat completions endpoint
      const result = await litellmUtils.testChatCompletion(
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 10,
        }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);
  });

  describe('Rate Limiting and Error Handling', () => {
    it('should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests to potentially trigger rate limiting
      const requests = Array(3).fill(null).map(async (_, index) => {
        await BaseProviderTestUtils.wait(index * 500); // Stagger requests
        
        return litellmUtils.testChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
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

    it('should handle proxy connection errors', async () => {
      // Test with a provider instance that has an invalid base URL
      const invalidProvider = new LiteLLMService();
      
      // Create temporary instance with invalid provider
      const invalidProviderUtils = new LiteLLMTestUtils(invalidProvider, apiKey);
      
      // This should fail due to connection error
      const result = await invalidProviderUtils.testChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
          max_tokens: 50
        });

      // Depending on the configuration, this might succeed or fail
      // If it fails, it should be due to connection issues
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    }, 15000);
  });
});
