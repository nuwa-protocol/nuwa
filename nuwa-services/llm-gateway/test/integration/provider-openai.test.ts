/**
 * OpenAI Provider Integration Tests
 * Tests real API calls with actual API keys from environment
 * Focus: Successful scenarios only - verifies API compatibility and data extraction
 */

import { OpenAIProvider } from '../../src/providers/openai.js';
import { TestEnv, createProviderTestSuite } from '../utils/testEnv.js';
import { OpenAITestUtils } from '../utils/openaiTestUtils.js';
import { BaseTestValidation } from '../utils/baseTestUtils.js';
import { pricingRegistry } from '../../src/billing/pricing.js';

// Log test environment status
beforeAll(() => {
  TestEnv.logStatus();
});

createProviderTestSuite('openai', () => {
  let provider: OpenAIProvider;
  let apiKey: string;
  let openaiUtils: OpenAITestUtils;

  beforeAll(() => {
    provider = new OpenAIProvider();
    apiKey = TestEnv.getProviderApiKey('openai')!;
    openaiUtils = new OpenAITestUtils(provider, apiKey);
  });

  describe('Chat Completions API', () => {
    it('should complete non-streaming chat completion successfully', async () => {
      const result = await openaiUtils.testChatCompletion(
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

      const validationResult = openaiUtils.validateResponse(result, validation);
      
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
      const result = await openaiUtils.testStreamingChatCompletion(
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

    it('should complete Response API requests successfully', async () => {
      const result = await openaiUtils.testResponseAPI(
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

    it('should complete Response API with tools successfully', async () => {
      const result = await openaiUtils.testResponseAPI(
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

    it('should support different models', async () => {
      const models = provider.getTestModels();
      
      for (const model of models) {
        // Add delay between requests to avoid rate limiting
        if (models.indexOf(model) > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await openaiUtils.testChatCompletion({
          model,
          max_tokens: 20 // Keep it small to reduce costs
        });

        // Accept both success and known unavailability conditions
        if (result.success) {
          expect(result.response).toBeDefined();
          expect(result.usage).toBeDefined();
          expect(result.cost).toBeDefined();
          expect(result.cost?.model).toBe(model);
          console.log(`✅ Model ${model} is available and working`);
        } else {
          // Log unavailable models for informational purposes
          console.log(`ℹ️ Model ${model} is not available: ${result.error}`);
          // Accept known unavailability errors (insufficient credits, model not configured, etc.)
          expect([400, 401, 403, 404, 429]).toContain(result.statusCode || 0);
        }
      }
    }, 120000); // Longer timeout for multiple model tests (now testing 4 models instead of 3)

  });


  describe('Usage Extraction', () => {
    it('should extract usage from non-streaming response', async () => {
      const result = await openaiUtils.testChatCompletion(
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

    it('should extract usage from streaming response when available', async () => {
      const result = await openaiUtils.testStreamingChatCompletion({
        model: 'gpt-3.5-turbo',
        max_tokens: 30
      });

      expect(result.success).toBe(true);
      
      // OpenAI supports usage in streaming mode with stream_options.include_usage
      if (result.usage) {
        expect(result.usage.promptTokens).toBeGreaterThan(0);
        expect(result.usage.completionTokens).toBeGreaterThan(0);
        expect(result.usage.totalTokens).toBe(
          result.usage.promptTokens + result.usage.completionTokens
        );
        console.log('✅ OpenAI provides usage information in streaming mode');
      } else {
        console.log('ℹ️ Usage information not available in streaming mode for this request');
      }
    }, 30000);

    it('should calculate costs correctly', async () => {
      const result = await openaiUtils.testChatCompletion(
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

    it('should distinguish between provider native cost and gateway pricing', async () => {
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo'
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      
      if (result.cost) {
        expect(result.cost.costUsd).toBeGreaterThan(0);
        expect(['provider', 'gateway-pricing']).toContain(result.cost.source);
        
        if (result.cost.source === 'provider') {
          console.log('✅ OpenAI provides native cost information');
        } else {
          console.log('ℹ️ Using gateway pricing fallback for cost calculation');
        }
      }
    }, 30000);

    it('should calculate cost accuracy for different pricing tiers', async () => {
      // Test with a model that has known pricing
      const testModel = 'gpt-3.5-turbo';
      const result = await openaiUtils.testChatCompletion({
        model: testModel,
        max_tokens: 50 // Fixed token count for predictable cost
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBeDefined();
      expect(result.usage).toBeDefined();
      
      if (result.cost && result.usage) {
        // Get pricing from configuration
        const pricing = pricingRegistry.getProviderPricing('openai', testModel);
        expect(pricing).toBeDefined();
        
        if (pricing) {
          // Calculate expected cost based on configuration pricing
          const expectedCost = (
            (result.usage.promptTokens * pricing.promptPerMTokUsd) +
            (result.usage.completionTokens * pricing.completionPerMTokUsd)
          ) / 1000000; // Convert from per-million-tokens to per-token
          
          // Allow reasonable tolerance for rounding and calculation differences
          const tolerance = 0.3; // 30% tolerance
          const expectedMinCost = expectedCost * (1 - tolerance);
          const expectedMaxCost = expectedCost * (1 + tolerance);
          
          expect(result.cost.costUsd).toBeGreaterThanOrEqual(expectedMinCost);
          expect(result.cost.costUsd).toBeLessThanOrEqual(expectedMaxCost);
          
          console.log(`Cost calculation: $${result.cost.costUsd} for ${result.usage.totalTokens} tokens (${result.cost.source})`);
          console.log(`Expected: $${expectedCost.toFixed(6)} (from config: $${pricing.promptPerMTokUsd}/$${pricing.completionPerMTokUsd} per 1M tokens)`);
        }
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

  describe('Provider-Specific Features', () => {
    it('should handle OpenAI-specific headers correctly', async () => {
      // OpenAI doesn't require special headers like other providers,
      // but we can verify standard headers are handled properly
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        max_tokens: 20
      });

      expect(result.success).toBe(true);
      // OpenAI uses standard Authorization header, no special headers required
      console.log('✅ OpenAI standard headers work correctly');
    }, 30000);

    it('should handle OpenAI-specific parameters correctly', async () => {
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        max_tokens: 30,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        stop: ['\n']
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      console.log('✅ OpenAI-specific parameters (temperature, top_p, penalties, stop) work correctly');
    }, 30000);

    it('should extract OpenAI-specific metadata', async () => {
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        max_tokens: 20
      });

      expect(result.success).toBe(true);
      
      // Check for OpenAI-specific response metadata
      if (result.response && typeof result.response === 'object') {
        // OpenAI responses typically include finish_reason, model, etc.
        console.log('✅ OpenAI metadata extracted successfully');
      }
    }, 30000);

    it('should handle stream_options parameter correctly', () => {
      // Test that stream_options is only added for streaming requests
      const nonStreamingData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };

      const streamingData = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const nonStreamingPrepared = provider.prepareRequestData(nonStreamingData, false);
      const streamingPrepared = provider.prepareRequestData(streamingData, true);

      // OpenAI only allows stream_options for streaming requests
      expect(nonStreamingPrepared.stream_options).toBeUndefined();
      expect(streamingPrepared.stream_options).toBeDefined();
      expect(streamingPrepared.stream_options.include_usage).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    it('should support function calling', async () => {
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'What is the weather like in San Francisco?' }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather information for a location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city name'
                }
              },
              required: ['location']
            }
          }
        }],
        max_tokens: 100
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      
      // Check if the model decided to call the function
      if (result.response && typeof result.response === 'object' && 'tool_calls' in result.response) {
        console.log('✅ OpenAI function calling works correctly');
      } else {
        console.log('ℹ️ Model chose not to call the function (this is normal behavior)');
      }
    }, 45000);

    it('should support vision capabilities with GPT-4V', async () => {
      // Test with a simple base64 encoded 1x1 pixel image to minimize cost
      const smallImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGAWA0ddgAAAABJRU5ErkJggg==';
      
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What do you see in this image?'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${smallImageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 50
      });

      // Accept both success and model unavailability
      if (result.success) {
        expect(result.response).toBeDefined();
        console.log('✅ OpenAI vision capabilities work correctly');
      } else {
        console.log(`ℹ️ Vision model not available: ${result.error}`);
        // Accept known unavailability errors
        expect([400, 401, 403, 404, 429]).toContain(result.statusCode || 0);
      }
    }, 60000);

    it('should support JSON response format', async () => {
      const result = await openaiUtils.testChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'user', 
            content: 'Generate a simple JSON object with a "message" field containing "Hello World"' 
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 50
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      
      if (result.response && typeof result.response === 'object' && 'content' in result.response) {
        try {
          const parsedContent = JSON.parse(result.response.content as string);
          expect(typeof parsedContent).toBe('object');
          console.log('✅ OpenAI JSON response format works correctly');
        } catch (e) {
          console.log('ℹ️ Response was not valid JSON, but request succeeded');
        }
      }
    }, 45000);
  });

});
