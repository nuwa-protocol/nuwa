/**
 * OpenAI Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 */

import { OpenAIProvider } from '../../src/providers/openai.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { OpenAITestUtils } from '../utils/openaiTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('openai', () => {
  let provider: OpenAIProvider;
  let apiKey: string;

  beforeAll(() => {
    provider = new OpenAIProvider();
    apiKey = TestEnv.getProviderApiKey('openai')!;
  });

  describe('Chat Completions API', () => {
    it('should handle non-streaming chat completion', async () => {
      const result = await OpenAITestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'gpt-3.5-turbo' }
      );

      const validation: BaseTestValidation = {
        expectSuccess: true,
        expectUsage: true,
        expectCost: true,
        minTokens: 10,
        maxTokens: 200,
        expectedModel: 'gpt-3.5-turbo',
      };

      const validationResult = OpenAITestUtils.validateTestResponse(result, validation);
      
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
      const result = await OpenAITestUtils.testStreamingChatCompletion(
        provider,
        apiKey,
        { 
          model: 'gpt-3.5-turbo',
          max_tokens: 30 // Shorter for streaming test
        }
      );

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

    it('should handle Response API requests', async () => {
      const result = await OpenAITestUtils.testResponseAPI(
        provider,
        apiKey,
        {
          model: 'gpt-4o-2024-08-06',
          input: 'What is artificial intelligence?',
          max_output_tokens: 100,
        }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.cost).toBeDefined();
      expect(result.cost?.costUsd).toBeGreaterThan(0);
    }, 60000); // Response API might take longer

    it('should handle Response API with tools', async () => {
      const result = await OpenAITestUtils.testResponseAPI(
        provider,
        apiKey,
        {
          model: 'gpt-4o-2024-08-06',
          input: 'What is the weather like in San Francisco?',
          tools: [{
            type: 'function',
            name: 'get_weather',
            description: 'Get current weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'City name' }
              },
              required: ['location']
            }
          }],
          max_output_tokens: 50,
        }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
    }, 60000); // Response API might take longer

    it('should handle errors gracefully', async () => {
      const result = await OpenAITestUtils.testChatCompletion(
        provider,
        apiKey,
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
      const result = await OpenAITestUtils.testChatCompletion(
        provider,
        'invalid-api-key',
        { model: 'gpt-3.5-turbo' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.statusCode).toBe(401);
    }, 15000);
  });


  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await OpenAITestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'gpt-3.5-turbo' }
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

    it('should calculate costs correctly', async () => {
      const result = await OpenAITestUtils.testChatCompletion(
        provider,
        apiKey,
        { model: 'gpt-3.5-turbo' }
      );

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(result.cost.source).toBeDefined();
        expect(['provider', 'gateway-pricing']).toContain(result.cost.source);
        expect(result.cost.model).toBe('gpt-3.5-turbo');
      }
    }, 30000);
  });

  describe('Request Preparation', () => {
    it('should prepare request data correctly for chat completions', () => {
      const originalData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const preparedData = provider.prepareRequestData(originalData, false);
      
      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.messages).toEqual(originalData.messages);
      
      // OpenAI only allows stream_options for streaming requests
      // For non-streaming requests, stream_options should not be present
      if (originalData.stream) {
        expect(preparedData.stream_options).toBeDefined();
        expect(preparedData.stream_options.include_usage).toBe(true);
      } else {
        expect(preparedData.stream_options).toBeUndefined();
      }
    });

    it('should prepare request data correctly for Response API', () => {
      const originalData = {
        model: 'gpt-4o-2024-08-06',
        input: 'What is AI?',
        tools: [{ type: 'web_search' }],
        stream: false,
      };

      const preparedData = provider.prepareRequestData(originalData, false);
      
      expect(preparedData).toBeDefined();
      expect(preparedData.model).toBe(originalData.model);
      expect(preparedData.input).toBe(originalData.input);
      expect(preparedData.tools).toEqual(originalData.tools);
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

  describe('Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests to potentially trigger rate limiting
      const requests = Array(5).fill(null).map(() => {
        return OpenAITestUtils.testChatCompletion(provider, apiKey, {
          model: 'gpt-3.5-turbo',
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
  });
});
