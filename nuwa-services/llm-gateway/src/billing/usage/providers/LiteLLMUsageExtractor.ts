import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * LiteLLM-specific usage extractor
 * Handles LiteLLM's Chat Completions format with header-based cost information
 */
export class LiteLLMUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('litellm');
  }

  /**
   * Extract usage from LiteLLM response body
   * LiteLLM uses standard Chat Completions format
   */
  extractFromResponseBody(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      const usage = responseBody.usage;
      if (!usage || typeof usage !== 'object') {
        return null;
      }

      console.log('[LiteLLMUsageExtractor] Extracting Chat Completions usage');
      return this.extractChatCompletionUsage(usage);
    } catch (error) {
      console.error('[LiteLLMUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from LiteLLM streaming chunk
   * LiteLLM uses standard Chat Completions streaming format
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Handle Chat Completions API format: data: {...usage...}
        if (trimmed.startsWith('data: ') && trimmed.includes('"usage"')) {
          const dataStr = trimmed.slice(6); // Remove 'data: ' prefix
          if (dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            // Chat Completions API: usage is at root level
            if (data.usage) {
              console.log('[LiteLLMUsageExtractor] Found LiteLLM usage in stream chunk:', JSON.stringify(data.usage));
              
              const result: { usage: UsageInfo; cost?: number } = {
                usage: this.extractChatCompletionUsage(data.usage)
              };
              
              // LiteLLM might provide cost in usage object (though typically in headers)
              if (typeof data.usage.cost === 'number') {
                result.cost = data.usage.cost;
                console.log('[LiteLLMUsageExtractor] Found cost in LiteLLM usage:', result.cost);
              }
              
              return result;
            }
          } catch (parseError) {
            console.error('[LiteLLMUsageExtractor] Error parsing LiteLLM data:', parseError);
          }
        }
      }
    } catch (error) {
      console.error('[LiteLLMUsageExtractor] Error extracting usage from stream chunk:', error);
      console.error('Chunk text:', chunkText.slice(0, 200));
    }
    
    return null;
  }

  /**
   * Extract LiteLLM's USD cost from response headers
   * LiteLLM provides cost in x-litellm-response-cost header
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    try {
      const headers = response.headers || {};
      const costHeader = headers['x-litellm-response-cost'];
      if (typeof costHeader === 'string') {
        const cost = Number(costHeader);
        if (Number.isFinite(cost)) {
          console.log('[LiteLLMUsageExtractor] Found cost in x-litellm-response-cost header:', cost);
          return cost;
        }
      }
      
      // Also check for other possible LiteLLM cost headers
      const altCostHeader = headers['x-litellm-cost'] || headers['litellm-cost'];
      if (typeof altCostHeader === 'string') {
        const cost = Number(altCostHeader);
        if (Number.isFinite(cost)) {
          console.log('[LiteLLMUsageExtractor] Found cost in alternative LiteLLM header:', cost);
          return cost;
        }
      }
    } catch (error) {
      console.error('[LiteLLMUsageExtractor] Error extracting USD cost from LiteLLM response:', error);
    }
    return undefined;
  }
}
