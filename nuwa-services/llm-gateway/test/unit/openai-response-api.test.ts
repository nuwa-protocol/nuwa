/**
 * Integration tests for OpenAI Response API support
 * Tests the enhanced functionality for Response API vs Chat Completions API
 */

import { OpenAIProvider } from '../../src/providers/openai.js';
import { pricingRegistry } from '../../src/billing/pricing.js';
import { DefaultUsageExtractor } from '../../src/billing/usage/DefaultUsageExtractor.js';
import { calculateToolCallCost } from '../../src/config/toolPricing.js';
import { CostCalculator } from '../../src/billing/usage/CostCalculator.js';

// Helper function for Response API cost calculation
function calculateResponseAPICost(
  model: string,
  usage: any,
  responseBody?: any,
  providerCostUsd?: number
) {
  // If provider already calculated total cost, use it
  if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
    const extractor = new DefaultUsageExtractor();
    const usageInfo = extractor.extractResponseAPIUsage(usage);
    return {
      costUsd: CostCalculator.applyMultiplier(providerCostUsd)!,
      source: 'provider',
      model,
      usage: usageInfo,
    };
  }

  // Calculate costs separately for tokens and tool calls
  const extractor = new DefaultUsageExtractor();
  const usageInfo = extractor.extractResponseAPIUsage(usage);
  if (!usageInfo) {
    return null;
  }

  // 1. Calculate model token cost
  const modelCostResult = pricingRegistry.calculateProviderCost('openai', model, usageInfo);
  const modelCost = modelCostResult?.costUsd || 0;

  // 2. Calculate tool call costs from usage.tool_calls_count (legacy)
  let toolCallCost = 0;
  if (usage.tool_calls_count) {
    console.log('📊 [calculateResponseAPICost] Using legacy tool_calls_count from usage');
    for (const [toolName, callCount] of Object.entries(usage.tool_calls_count)) {
      if (typeof callCount === 'number' && callCount > 0) {
        const cost = calculateToolCallCost(toolName, callCount);
        toolCallCost += cost;
      }
    }
  }

  // 3. Total cost
  const totalCost = modelCost + toolCallCost;

  console.log(
    `💰 [calculateResponseAPICost] Cost breakdown - Model: $${modelCost.toFixed(6)}, Tools: $${toolCallCost.toFixed(6)}, Total: $${totalCost.toFixed(6)}`
  );

  return {
    costUsd: CostCalculator.applyMultiplier(totalCost)!,
    source: 'gateway-pricing',
    pricingVersion: pricingRegistry.getProviderVersion('openai'),
    model,
    usage: usageInfo,
  };
}

describe('OpenAI Response API Integration Tests', () => {
  let openaiProvider: OpenAIProvider;

  beforeAll(() => {
    openaiProvider = new OpenAIProvider();
  });

  describe('Request Data Preparation', () => {
    it('should detect Response API requests correctly', () => {
      const responseAPIRequest = {
        model: 'gpt-4',
        input: 'Hello, world!',
        tools: [{ type: 'web_search', web_search: { enabled: true } }],
        store: true,
      };

      const preparedData = openaiProvider.prepareRequestData(responseAPIRequest, false);

      // Input should be kept as string format for Response API
      expect(preparedData.input).toBe('Hello, world!');
      expect(preparedData.model).toBe('gpt-4');
      expect(preparedData.store).toBe(true);
      expect(preparedData.tools).toEqual([{ type: 'web_search', web_search: { enabled: true } }]);
    });

    it('should detect Chat Completions API requests correctly', () => {
      const chatRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        temperature: 0.7,
      };

      const preparedData = openaiProvider.prepareRequestData(chatRequest, false);
      expect(preparedData).toEqual(chatRequest);
    });

    it('should normalize Response API tools correctly', () => {
      const requestWithTools = {
        model: 'gpt-4',
        input: 'Search for information about AI',
        tools: [
          { type: 'web_search' },
          { type: 'file_search' },
          { type: 'computer_use' },
          { type: 'future_new_tool' }, // Test with a hypothetical new tool
        ],
      };

      const preparedData = openaiProvider.prepareRequestData(requestWithTools, false);
      expect(preparedData.tools).toEqual([
        { type: 'web_search' },
        { type: 'file_search' },
        { type: 'computer_use' },
        { type: 'future_new_tool' },
      ]);
    });

    it('should normalize Response API input correctly', () => {
      const requestWithStringInput = {
        model: 'gpt-4',
        input: 'Hello, world!',
      };

      const preparedData = openaiProvider.prepareRequestData(requestWithStringInput, false);
      expect(preparedData.input).toBe('Hello, world!');
    });

    it('should NOT inject stream_options for Response API streaming requests', () => {
      const streamingRequest = {
        model: 'gpt-4',
        input: 'Hello, world!',
        stream: true,
        tools: [{ type: 'web_search' }],
      };

      const preparedData = openaiProvider.prepareRequestData(streamingRequest, true);
      // Response API does NOT support stream_options
      expect(preparedData.stream_options).toBeUndefined();
    });

    it('should inject stream_options for Chat Completions API streaming requests', () => {
      const streamingRequest = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const preparedData = openaiProvider.prepareRequestData(streamingRequest, true);
      // Chat Completions API DOES support stream_options
      expect(preparedData.stream_options).toEqual({
        include_usage: true,
      });
    });
  });

  describe('Response Parsing', () => {
    it('should parse Response API response correctly', () => {
      const responseAPIResponse = {
        data: {
          id: 'resp_123',
          object: 'response',
          created: 1234567890,
          model: 'gpt-4',
          output: {
            type: 'text',
            text: 'Hello! How can I help you today?',
          },
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
            web_search_tokens: 5,
            tool_call_tokens: 3,
          },
        },
      };

      const parsed = openaiProvider.parseResponse(responseAPIResponse as any);

      // Should preserve original usage structure for proper cost calculation
      expect(parsed.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
        web_search_tokens: 5,
        tool_call_tokens: 3,
      });
    });

    it('should parse Chat Completions API response correctly', () => {
      const chatResponse = {
        data: {
          id: 'chatcmpl_123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
          },
        },
      };

      const parsed = openaiProvider.parseResponse(chatResponse as any);

      // Should keep usage as-is for chat completions
      expect(parsed.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      });
    });
  });

  describe('Usage Extraction', () => {
    it('should extract Response API usage from response body', () => {
      const responseBody = {
        id: 'resp_123',
        object: 'response',
        usage: {
          input_tokens: 20, // Response API uses input_tokens
          output_tokens: 30, // Response API uses output_tokens
          total_tokens: 73, // Total should match expected
          web_search_tokens: 10, // Tool content tokens (added to prompt)
          file_search_tokens: 5, // Tool content tokens (added to prompt)
          tool_call_tokens: 8, // Tool content tokens (added to prompt)
        },
      };

      const extractor = new DefaultUsageExtractor();
      const usage = extractor.extractFromResponseBody(responseBody);
      expect(usage).toEqual({
        promptTokens: 43, // 20 + 10 + 5 + 8 (tool content tokens added to prompt)
        completionTokens: 30, // Original completion tokens unchanged
        totalTokens: 73, // 43 + 30
      });
    });

    it('should handle new tool types dynamically', () => {
      const responseBodyWithNewTools = {
        id: 'resp_124',
        object: 'response',
        usage: {
          input_tokens: 15, // Response API uses input_tokens
          output_tokens: 25, // Response API uses output_tokens
          total_tokens: 65, // Total should match expected
          web_search_tokens: 5, // Tool content tokens (should go to prompt)
          future_ai_tool_tokens: 12, // New hypothetical tool content
          another_new_tool_tokens: 8, // Another new tool content
        },
      };

      const extractor = new DefaultUsageExtractor();
      const usage = extractor.extractFromResponseBody(responseBodyWithNewTools);
      expect(usage).toEqual({
        promptTokens: 40, // 15 + 5 + 12 + 8 (tool content tokens added to prompt)
        completionTokens: 25, // Original completion tokens unchanged
        totalTokens: 65, // 40 + 25
      });
    });

    it('should extract Chat Completions usage from response body', () => {
      const responseBody = {
        id: 'chatcmpl_123',
        object: 'chat.completion',
        usage: {
          prompt_tokens: 20,
          completion_tokens: 30,
          total_tokens: 50,
        },
      };

      const extractor = new DefaultUsageExtractor();
      const usage = extractor.extractFromResponseBody(responseBody);
      expect(usage).toEqual({
        promptTokens: 20,
        completionTokens: 30,
        totalTokens: 50,
      });
    });

    it('should extract Response API usage from SSE stream chunk', () => {
      const sseChunk = `event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":30,"total_tokens":65,"web_search_tokens":10,"tool_call_tokens":5}}}\n\n`;

      const extractor = new DefaultUsageExtractor();
      const result = extractor.extractFromStreamChunk(sseChunk);
      expect(result).toBeTruthy();
      expect(result?.usage).toEqual({
        promptTokens: 35, // 20 + 10 + 5 (tool content tokens added to prompt)
        completionTokens: 30, // Original completion tokens unchanged
        totalTokens: 65, // 35 + 30
      });
    });

    it('should extract Chat Completions usage from SSE stream chunk', () => {
      const sseChunk = `data: {"id":"chatcmpl_123","object":"chat.completion.chunk","usage":{"prompt_tokens":20,"completion_tokens":30,"total_tokens":50}}\n\ndata: [DONE]\n\n`;

      const extractor = new DefaultUsageExtractor();
      const result = extractor.extractFromStreamChunk(sseChunk);
      expect(result).toBeTruthy();
      expect(result?.usage).toEqual({
        promptTokens: 20,
        completionTokens: 30,
        totalTokens: 50,
      });
    });
  });

  describe('Cost Calculation Integration', () => {
    it('should calculate cost correctly for Response API with tool usage', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500, // No tool tokens mixed in
        totalTokens: 1500,
      };

      const result = pricingRegistry.calculateProviderCost('openai', 'gpt-4', usage);
      expect(result).toBeTruthy();
      expect(result?.costUsd).toBeCloseTo(0.06); // (1000/1M * 30) + (500/1M * 60) = 0.03 + 0.03 = 0.06
      expect(result?.source).toBe('gateway-pricing');
    });

    it('should handle tool call costs separately from token costs', () => {
      // Mock usage with tool calls (Response API format)
      const responseUsage = {
        input_tokens: 500, // Response API uses input_tokens
        output_tokens: 300, // Response API uses output_tokens
        total_tokens: 1000, // Total tokens
        web_search_tokens: 200, // Content tokens from web search
        tool_calls_count: {
          web_search: 2, // 2 web search calls
          file_search: 1, // 1 file search call
        },
      };

      const result = calculateResponseAPICost('gpt-4', responseUsage);
      expect(result).toBeTruthy();

      // Expected calculation:
      // Prompt tokens: 500 + 200 = 700 (input + web_search_tokens)
      // Token cost: (700 prompt tokens * $30/1M) + (300 completion tokens * $60/1M) = $0.021 + $0.018 = $0.039
      // Tool call cost: (2 web_search * $10/1000) + (1 file_search * $2.50/1000) = $0.02 + $0.0025 = $0.0225
      // Total: $0.039 + $0.0225 = $0.0615
      expect(result?.costUsd).toBeCloseTo(0.0615, 4);
      expect(result?.source).toBe('gateway-pricing');
    });

    it('should handle unified pricing for all token types', () => {
      // Test that tool content tokens are correctly added to prompt tokens
      const responseAPIUsage = {
        promptTokens: 700, // 500 original + 200 tool content tokens
        completionTokens: 300, // Original completion tokens only
        totalTokens: 1000,
      };

      const chatAPIUsage = {
        promptTokens: 700, // Same total prompt tokens for comparison
        completionTokens: 300, // Same completion tokens
        totalTokens: 1000,
      };

      const responseResult = pricingRegistry.calculateProviderCost(
        'openai',
        'gpt-4o',
        responseAPIUsage
      );
      const chatResult = pricingRegistry.calculateProviderCost('openai', 'gpt-4o', chatAPIUsage);

      // Should produce same cost calculation for token portion
      expect(responseResult?.costUsd).toBeCloseTo(chatResult?.costUsd || 0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing Chat Completions workflow', () => {
      const chatRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      // Should still work with existing chat completions logic
      const preparedData = openaiProvider.prepareRequestData(chatRequest, true);
      expect(preparedData.stream_options.include_usage).toBe(true);
      expect(preparedData.messages).toEqual(chatRequest.messages);
    });

    it('should not break existing usage extraction for chat completions', () => {
      const chatResponse = {
        id: 'chatcmpl_123',
        object: 'chat.completion',
        choices: [{ message: { content: 'Hello!' } }],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15,
        },
      };

      const extractor = new DefaultUsageExtractor();
      const usage = extractor.extractFromResponseBody(chatResponse);
      expect(usage).toEqual({
        promptTokens: 5,
        completionTokens: 10,
        totalTokens: 15,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed Response API data gracefully', () => {
      const malformedData = {
        model: 'gpt-4',
        input: null,
        tools: 'invalid',
      };

      // Should not throw an error
      expect(() => {
        openaiProvider.prepareRequestData(malformedData, false);
      }).not.toThrow();
    });

    it('should handle missing usage data gracefully', () => {
      const responseWithoutUsage = {
        id: 'resp_123',
        object: 'response',
        output: { type: 'text', text: 'Hello!' },
      };

      const extractor = new DefaultUsageExtractor();
      const usage = extractor.extractFromResponseBody(responseWithoutUsage);
      expect(usage).toBeNull();
    });
  });
});
