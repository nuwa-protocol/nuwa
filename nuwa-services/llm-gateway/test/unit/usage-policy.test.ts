/**
 * Unit tests for cost calculation logic
 * Tests CostCalculator and provider-specific functionality
 */

import { CostCalculator } from '../../src/billing/usage/CostCalculator.js';
import { DefaultUsageExtractor } from '../../src/billing/usage/DefaultUsageExtractor.js';

describe('Cost Calculation Unit Tests', () => {
  describe('CostCalculator', () => {
    it('should calculate request costs with provider preference', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      
      // Test provider cost preference
      const resultWithProvider = CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', 0.05, usage);
      expect(resultWithProvider?.costUsd).toBe(0.05);
      expect(resultWithProvider?.source).toBe('provider');

      // Test gateway pricing fallback
      const resultWithoutProvider = CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', undefined, usage);
      expect(resultWithoutProvider?.costUsd).toBeCloseTo(0.06);
      expect(resultWithoutProvider?.source).toBe('gateway-pricing');
    });

    it('should return null for invalid usage', () => {
      const result = CostCalculator.calculateProviderRequestCost('openai', 'gpt-4', undefined, undefined);
      expect(result).toBeNull();
    });
  });

  describe('DefaultUsageExtractor', () => {
    const extractor = new DefaultUsageExtractor();

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

      const usage = extractor.extractFromResponseBody(responseBody);
      expect(usage).toBeTruthy();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
      expect(usage?.totalTokens).toBe(15);
    });

    it('should extract usage from SSE stream chunks', () => {
      const sseChunk = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n`;

      const result = extractor.extractFromStreamChunk(sseChunk);
      expect(result).toBeTruthy();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.usage.totalTokens).toBe(15);
    });

    it('should extract usage and cost from SSE stream chunks with cost', () => {
      const sseChunkWithCost = `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost":0.000025}}\n\ndata: [DONE]\n\n`;

      const result = extractor.extractFromStreamChunk(sseChunkWithCost);
      expect(result).toBeTruthy();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.cost).toBe(0.000025);
    });

    it('should return null for invalid response body', () => {
      const result = extractor.extractFromResponseBody({});
      expect(result).toBeNull();
    });

    it('should return null for invalid stream chunk', () => {
      const result = extractor.extractFromStreamChunk('invalid chunk');
      expect(result).toBeNull();
    });
  });
});
