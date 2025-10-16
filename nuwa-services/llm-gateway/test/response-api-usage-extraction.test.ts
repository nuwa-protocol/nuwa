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
          input_tokens: 10,
          output_tokens: 5,
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
          input_tokens: 20,
          output_tokens: 10,
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

    it('should extract usage from real OpenAI Response API format with details', () => {
      const responseBody = {
        id: 'resp_0088114fb2a85e7f0068f03277492081969b8a6eb303eba34c',
        object: 'response',
        output: { type: 'text', text: 'Real response' },
        usage: {
          input_tokens: 17142,
          input_tokens_details: {
            cached_tokens: 0
          },
          output_tokens: 638,
          output_tokens_details: {
            reasoning_tokens: 0
          },
          total_tokens: 17780
        }
      };

      const usage = UsagePolicy.extractUsageFromResponse(responseBody);
      
      expect(usage).not.toBeNull();
      expect(usage?.promptTokens).toBe(17142);
      expect(usage?.completionTokens).toBe(638);
      expect(usage?.totalTokens).toBe(17780);
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
      const chunk = `event: response.completed\ndata: {"type":"response.completed","sequence_number":66,"response":{"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}\n\n`;

      const result = UsagePolicy.extractUsageFromStreamChunk(chunk);
      
      expect(result).not.toBeNull();
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.usage.totalTokens).toBe(15);
    });

    it('should extract usage with tool tokens from stream chunk', () => {
      const chunk = `event: response.completed\ndata: {"type":"response.completed","sequence_number":66,"response":{"usage":{"input_tokens":20,"output_tokens":10,"total_tokens":50,"web_search_tokens":15,"tool_call_tokens":5}}}\n\n`;

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

  describe('Tool Call Parsing and Validation', () => {
    describe('parseToolCallsFromOutput', () => {
      it('should parse web search calls from output array', () => {
        const responseBody = {
          output: [
            {
              id: 'ws_123',
              type: 'web_search_call',
              status: 'completed',
              action: { type: 'search', query: 'test' }
            },
            {
              id: 'msg_456',
              type: 'message',
              content: [{ type: 'text', text: 'Result' }]
            }
          ]
        };

        const toolCalls = UsagePolicy.parseToolCallsFromOutput(responseBody);
        
        expect(toolCalls).toEqual({ web_search: 1 });
      });

      it('should parse multiple tool calls', () => {
        const responseBody = {
          output: [
            { id: 'ws_1', type: 'web_search_call', status: 'completed' },
            { id: 'ws_2', type: 'web_search_call', status: 'completed' },
            { id: 'fs_1', type: 'file_search_call', status: 'completed' },
            { id: 'msg_1', type: 'message', content: [] }
          ]
        };

        const toolCalls = UsagePolicy.parseToolCallsFromOutput(responseBody);
        
        expect(toolCalls).toEqual({ 
          web_search: 2,
          file_search: 1
        });
      });

      it('should return empty object for no tool calls', () => {
        const responseBody = {
          output: [
            { id: 'msg_1', type: 'message', content: [] }
          ]
        };

        const toolCalls = UsagePolicy.parseToolCallsFromOutput(responseBody);
        
        expect(toolCalls).toEqual({});
      });
    });

    describe('validateRequestTools', () => {
      it('should validate supported tools', () => {
        const requestData = {
          tools: [
            { type: 'web_search' },
            { type: 'file_search' },
            { type: 'function', function: { name: 'custom' } }
          ]
        };

        const result = UsagePolicy.validateRequestTools(requestData);
        
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject unsupported tools', () => {
        const requestData = {
          tools: [
            { type: 'web_search' },
            { type: 'unsupported_tool' }
          ]
        };

        const result = UsagePolicy.validateRequestTools(requestData);
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unsupported_tool');
      });

      it('should pass validation with no tools', () => {
        const requestData = {};

        const result = UsagePolicy.validateRequestTools(requestData);
        
        expect(result.valid).toBe(true);
      });
    });

    describe('calculateResponseAPICost', () => {
      it('should calculate cost with tool calls from output', () => {
        const responseBody = {
          output: [
            { id: 'ws_1', type: 'web_search_call', status: 'completed' }
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150
          }
        };

        const result = UsagePolicy.calculateResponseAPICost('gpt-4o', responseBody.usage, responseBody);
        
        expect(result).not.toBeNull();
        expect(result?.costUsd).toBeGreaterThan(0);
        expect(result?.source).toBe('gateway-pricing');
      });

      it('should prefer provider cost when available', () => {
        const responseBody = {
          output: [
            { id: 'ws_1', type: 'web_search_call', status: 'completed' }
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150
          }
        };

        const result = UsagePolicy.calculateResponseAPICost('gpt-4o', responseBody.usage, responseBody, 0.05);
        
        expect(result).not.toBeNull();
        expect(result?.costUsd).toBe(0.05);
        expect(result?.source).toBe('provider');
      });
    });
  });
});

