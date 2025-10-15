/**
 * Unit tests for Response API usage extraction and billing
 */

import { UsagePolicy } from '../src/billing/usagePolicy.js';

describe('Response API Usage Extraction', () => {
  describe('extractUsageFromResponse', () => {
    it('should extract standard usage from Response API response', () => {
      const responseBody = {
        id: 'resp_123',
        object: 'response',
        output: { type: 'text', text: 'Hello' },
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      
      expect(usage).not.toBeNull();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
      expect(usage?.totalTokens).toBe(15);
    });

    it('should extract extended usage from Response API with tool tokens', () => {
      const responseBody = {
        id: 'resp_123',
        object: 'response',
        output: { type: 'text', text: 'Search result' },
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 50,
          web_search_tokens: 15,
          tool_call_tokens: 5
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      
      expect(usage).not.toBeNull();
      expect(usage?.promptTokens).toBe(40); // 20 + 15 + 5 (tool tokens added to prompt)
      expect(usage?.completionTokens).toBe(10);
      expect(usage?.totalTokens).toBe(50);
    });

    it('should return null if no usage field', () => {
      const responseBody = {
        id: 'resp_123',
        object: 'response',
        output: { type: 'text', text: 'Hello' }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      
      expect(usage).toBeNull();
    });

    it('should extract usage from Chat Completions response', () => {
      const responseBody = {
        id: 'chatcmpl_123',
        object: 'chat.completion',
        choices: [{ message: { content: 'Hello' } }],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 3,
          total_tokens: 11
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      
      expect(usage).not.toBeNull();
      expect(usage?.promptTokens).toBe(8);
      expect(usage?.completionTokens).toBe(3);
      expect(usage?.totalTokens).toBe(11);
    });
  });

  describe('extractUsageFromStreamChunk', () => {
    it('should extract usage from Response API stream chunk', () => {
      const chunk = `data: {"id":"resp_123","object":"response.chunk","output":{"type":"text","text":"Hi"}}\n\ndata: {"id":"resp_123","object":"response.chunk","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).not.toBeNull();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.usage.totalTokens).toBe(15);
    });

    it('should extract usage with tool tokens from stream chunk', () => {
      const chunk = `data: {"id":"resp_123","object":"response.chunk","usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":50,"web_search_tokens":15,"tool_call_tokens":5}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).not.toBeNull();
      expect(result?.usage.promptTokens).toBe(40); // 20 + 15 + 5
      expect(result?.usage.completionTokens).toBe(10);
      expect(result?.usage.totalTokens).toBe(50);
    });

    it('should extract cost if provided in stream chunk', () => {
      const chunk = `data: {"id":"resp_123","object":"response.chunk","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost":0.000375}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).not.toBeNull();
      expect(result?.cost).toBe(0.000375);
    });

    it('should return null if no usage in chunk', () => {
      const chunk = `data: {"id":"resp_123","object":"response.chunk","output":{"type":"text","text":"Hi"}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).toBeNull();
    });

    it('should extract usage from Chat Completions stream chunk', () => {
      const chunk = `data: {"id":"chatcmpl_123","object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":3,"total_tokens":11}}\n\ndata: [DONE]\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).not.toBeNull();
      expect(result?.usage.promptTokens).toBe(8);
      expect(result?.usage.completionTokens).toBe(3);
    });
  });

  describe('calculateRequestCost', () => {
    it('should prefer provider cost over gateway pricing', () => {
      const usage = {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15
      };

      const result = UsagePolicy.calculateRequestCost('gpt-4o', 0.001, usage);
      
      expect(result).not.toBeNull();
      expect(result?.costUsd).toBe(0.001);
      expect(result?.source).toBe('provider');
    });

    it('should use gateway pricing if provider cost not provided', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500
      };

      const result = UsagePolicy.calculateRequestCost('gpt-4o', undefined, usage);
      
      expect(result).not.toBeNull();
      expect(result?.costUsd).toBeGreaterThan(0);
      expect(result?.source).toBe('gateway-pricing');
    });

    it('should return null if no usage and no provider cost', () => {
      const result = UsagePolicy.calculateRequestCost('gpt-4o', undefined, undefined);
      
      expect(result).toBeNull();
    });

    it('should return null if usage has zero tokens', () => {
      const usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      };

      const result = UsagePolicy.calculateRequestCost('gpt-4o', undefined, usage);
      
      expect(result).toBeNull();
    });
  });

  describe('StreamProcessor', () => {
    it('should accumulate usage from chunks and calculate final cost', () => {
      const processor = UsagePolicy.createStreamProcessor('gpt-4o', undefined);

      // Process chunk without usage
      processor.processChunk('data: {"output":"partial"}\n\n');
      expect(processor.getFinalCost()).toBeNull();

      // Process chunk with usage
      const usageChunk = 'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n';
      processor.processChunk(usageChunk);

      const finalCost = processor.getFinalCost();
      expect(finalCost).not.toBeNull();
      expect(finalCost?.costUsd).toBeGreaterThan(0);
      expect(finalCost?.source).toBe('gateway-pricing');
    });

    it('should use provider cost from initial setup', () => {
      const providerCost = 0.001;
      const processor = UsagePolicy.createStreamProcessor('gpt-4o', providerCost);

      const usageChunk = 'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n';
      processor.processChunk(usageChunk);

      const finalCost = processor.getFinalCost();
      expect(finalCost).not.toBeNull();
      expect(finalCost?.costUsd).toBe(providerCost);
      expect(finalCost?.source).toBe('provider');
    });

    it('should override provider cost with stream-provided cost', () => {
      const initialCost = 0.001;
      const streamCost = 0.002;
      const processor = UsagePolicy.createStreamProcessor('gpt-4o', initialCost);

      const usageChunk = `data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"cost":${streamCost}}}\n\n`;
      processor.processChunk(usageChunk);

      const finalCost = processor.getFinalCost();
      expect(finalCost).not.toBeNull();
      expect(finalCost?.costUsd).toBe(streamCost);
      expect(finalCost?.source).toBe('provider');
    });

    it('should return usage information', () => {
      const processor = UsagePolicy.createStreamProcessor('gpt-4o', undefined);

      const usageChunk = 'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n';
      processor.processChunk(usageChunk);

      const usage = processor.getUsage();
      expect(usage).not.toBeNull();
      expect(usage?.promptTokens).toBe(10);
      expect(usage?.completionTokens).toBe(5);
    });
  });
});

