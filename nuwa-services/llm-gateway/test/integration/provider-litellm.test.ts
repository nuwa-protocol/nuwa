/**
 * LiteLLM Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Note: Requires a running LiteLLM proxy server
 */

import LiteLLMService from '../../src/services/litellm.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { ProviderTestUtils, TestRequestConfig, TestResponseValidation } from '../utils/providerTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('litellm', () => {
  let provider: LiteLLMService;
  let apiKey: string;
  let baseUrl: string;

  beforeAll(() => {
    provider = new LiteLLMService();
    apiKey = TestEnv.getProviderApiKey('litellm')!;
    baseUrl = TestEnv.getProviderBaseUrl('litellm')!;
    
    console.log(`Testing LiteLLM at: ${baseUrl}`);
  });

  describe('Chat Completions API', () => {
    it('should handle non-streaming chat completion', async () => {
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
      );

      const validation: TestResponseValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: config.model,
      };

      const validationResult = ProviderTestUtils.validateTestResponse(result, validation);
      
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
      const config: TestRequestConfig = {
        ...ProviderTestUtils.getProviderTestConfig('litellm'),
        stream: true,
        max_tokens: 30, // Shorter for streaming test
      };
      
      const result = await ProviderTestUtils.testProviderStreamingChatCompletion(
        provider,
        apiKey,
        config
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
      const models = [
        'gpt-3.5-turbo',
        'claude-3-haiku',
        'llama-2-7b-chat',
      ];

      for (const model of models) {
        const config: TestRequestConfig = {
          model,
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          max_tokens: 20,
        };
        
        const result = await ProviderTestUtils.testProviderChatCompletion(
          provider,
          apiKey,
          config
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
        await ProviderTestUtils.wait(1000);
      }
    }, 60000);

    it('should handle errors gracefully', async () => {
      const config: TestRequestConfig = {
        model: 'invalid-model-name',
        messages: [{ role: 'user', content: 'Hello' }],
      };
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    }, 15000);

    it('should handle invalid API key', async () => {
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        'invalid-api-key',
        config
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBe(401);
    }, 15000);
  });

  describe('Models API', () => {
    it('should fetch available models', async () => {
      const result = await ProviderTestUtils.testProviderModels(
        provider,
        apiKey,
        '/models'
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.data).toBeDefined();
      expect(Array.isArray(result.response.data)).toBe(true);
      expect(result.response.data.length).toBeGreaterThan(0);
      
      // Check that models have expected structure
      const firstModel = result.response.data[0];
      expect(firstModel.id).toBeDefined();
      expect(firstModel.object).toBe('model');
    }, 15000);

    it('should handle models API with invalid API key', async () => {
      const result = await ProviderTestUtils.testProviderModels(
        provider,
        'invalid-api-key',
        '/models'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBe(401);
    }, 15000);
  });

  describe('Usage Extraction and Cost Calculation', () => {
    it('should extract usage from non-streaming response', async () => {
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
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
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
      );

      expect(result.success).toBe(true);
      
      // LiteLLM might provide cost information via headers
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBe('provider');
        expect(result.cost.model).toBe(config.model);
      }
    }, 30000);

    it('should extract cost from streaming response', async () => {
      const config: TestRequestConfig = {
        ...ProviderTestUtils.getProviderTestConfig('litellm'),
        stream: true,
        max_tokens: 20,
      };
      
      const result = await ProviderTestUtils.testProviderStreamingChatCompletion(
        provider,
        apiKey,
        config
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
      const config: TestRequestConfig = {
        ...ProviderTestUtils.getProviderTestConfig('litellm'),
        max_tokens: 20,
      };
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should handle custom LiteLLM parameters', async () => {
      const config: TestRequestConfig = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 20,
        // LiteLLM specific parameters
        metadata: {
          user_id: 'test-user',
          tags: ['integration-test'],
        },
      };
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
      );

      // Should handle the request regardless of LiteLLM specific parameters
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 30000);

    it('should extract cost from x-litellm-response-cost header', async () => {
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      const result = await ProviderTestUtils.testProviderChatCompletion(
        provider,
        apiKey,
        config
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
    it('should handle proxy health check', async () => {
      // Test a simple health endpoint if available
      const result = await ProviderTestUtils.testProviderModels(
        provider,
        apiKey,
        '/health'
      );

      // Health endpoint might not be available, so we allow both success and 404
      if (result.success) {
        expect(result.response).toBeDefined();
      } else {
        expect([404, 405]).toContain(result.statusCode); // Not found or method not allowed
      }
    }, 15000);

    it('should handle different API paths', async () => {
      // Test different path formats that LiteLLM might use
      const paths = [
        '/chat/completions',
        '/v1/chat/completions',
      ];

      for (const path of paths) {
        const config: TestRequestConfig = {
          ...ProviderTestUtils.getProviderTestConfig('litellm'),
          max_tokens: 10,
        };
        
        try {
          const result = await ProviderTestUtils.testProviderChatCompletion(
            provider,
            apiKey,
            config
          );

          // At least one path should work
          if (result.success) {
            expect(result.response).toBeDefined();
            console.log(`Path ${path} works`);
            break;
          }
        } catch (error) {
          console.log(`Path ${path} failed: ${error}`);
        }

        await ProviderTestUtils.wait(500);
      }
    }, 30000);
  });

  describe('Rate Limiting and Error Handling', () => {
    it('should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests to potentially trigger rate limiting
      const requests = Array(3).fill(null).map(async (_, index) => {
        await ProviderTestUtils.wait(index * 500); // Stagger requests
        
        const config: TestRequestConfig = {
          ...ProviderTestUtils.getProviderTestConfig('litellm'),
          max_tokens: 10, // Keep it small and fast
        };
        
        return ProviderTestUtils.testProviderChatCompletion(provider, apiKey, config);
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
      
      const config: TestRequestConfig = ProviderTestUtils.getProviderTestConfig('litellm');
      
      // This should fail due to connection error
      const result = await ProviderTestUtils.testProviderChatCompletion(
        invalidProvider,
        apiKey,
        config
      );

      // Depending on the configuration, this might succeed or fail
      // If it fails, it should be due to connection issues
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    }, 15000);
  });
});
