/**
 * Unit tests for usage policy
 * Tests usage extraction and cost calculation logic
 */

import { UsagePolicy } from '../../src/billing/usagePolicy.js';

describe('Usage Policy Unit Tests', () => {
  describe('Usage Extraction from Response Body', () => {
    it('should extract usage from response body', () => {
      const responseBody = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hello!' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      expect(usage).toBeTruthy();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
      expect(usage?.totalTokens).toBe(15);
    });
  });

  describe('Stream Usage Options', () => {
    it('should inject stream usage options', () => {
      const requestData = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      };

      const injected = UsagePolicy.injectStreamUsageOption(requestData);
      expect(injected.stream_options).toBeTruthy();
      expect(injected.stream_options.include_usage).toBe(true);
    });
  });

  describe('Cost Calculation with Provider Preference', () => {
    it('should calculate request costs with provider preference', () => {
      const usage = { promptTokens: 1000, completionTokens: 500 };
      
      // Test provider cost preference
      const resultWithProvider = UsagePolicy.calculateRequestCost('gpt-4', 0.05, usage);
      expect(resultWithProvider?.costUsd).toBe(0.05);
      expect(resultWithProvider?.source).toBe('provider');

      // Test gateway pricing fallback
      const resultWithoutProvider = UsagePolicy.calculateRequestCost('gpt-4', undefined, usage);
      expect(resultWithoutProvider?.costUsd).toBeCloseTo(0.06);
      expect(resultWithoutProvider?.source).toBe('gateway-pricing');
    });
  });

  describe('SSE Stream Usage Extraction', () => {
    it('should extract usage from SSE stream chunks', () => {
      const sseChunk = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(sseChunk);
      expect(result).toBeTruthy();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.usage.totalTokens).toBe(15);
    });

    it('should extract usage and cost from SSE stream chunks (OpenRouter)', () => {
      const sseChunkWithCost = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost":0.000025}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(sseChunkWithCost);
      expect(result).toBeTruthy();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.cost).toBe(0.000025);
    });
  });
});
