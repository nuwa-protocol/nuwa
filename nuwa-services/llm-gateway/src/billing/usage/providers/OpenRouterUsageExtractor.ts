import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * OpenRouter-specific usage extractor
 * Handles OpenRouter's Chat Completions format with native USD cost support
 */
export class OpenRouterUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('openrouter');
  }

  /**
   * Extract usage from OpenRouter response body
   * OpenRouter uses Chat Completions format with additional cost information
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

      console.log('[OpenRouterUsageExtractor] Extracting Chat Completions usage');
      return this.extractChatCompletionUsage(usage);
    } catch (error) {
      console.error('[OpenRouterUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from OpenRouter streaming chunk
   * OpenRouter uses Chat Completions streaming format with cost information
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
              console.log(
                '[OpenRouterUsageExtractor] Found OpenRouter usage in stream chunk:',
                JSON.stringify(data.usage)
              );

              const result: { usage: UsageInfo; cost?: number } = {
                usage: this.extractChatCompletionUsage(data.usage),
              };

              // OpenRouter provides native USD cost in usage.cost
              if (typeof data.usage.cost === 'number') {
                result.cost = data.usage.cost;
                console.log(
                  '[OpenRouterUsageExtractor] Found cost in OpenRouter usage:',
                  result.cost
                );
              }

              return result;
            }
          } catch (parseError) {
            console.error('[OpenRouterUsageExtractor] Error parsing OpenRouter data:', parseError);
          }
        }
      }
    } catch (error) {
      console.error('[OpenRouterUsageExtractor] Error extracting usage from stream chunk:', error);
      console.error('Chunk text:', chunkText.slice(0, 200));
    }

    return null;
  }

  /**
   * Extract OpenRouter's native USD cost from response
   * OpenRouter provides cost in usage.cost or x-usage header
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    try {
      const data = response.data;

      // Check if this is a stream response (data has pipe method)
      if (data && typeof data === 'object' && typeof data.pipe === 'function') {
        // For stream responses, cost is not available at this stage
        // It will be extracted later from SSE chunks
        return undefined;
      }

      // For non-stream responses, try to get cost from response body first
      if (data && typeof data === 'object' && data.usage && typeof data.usage.cost === 'number') {
        console.log('[OpenRouterUsageExtractor] Found cost in response body:', data.usage.cost);
        return data.usage.cost;
      }

      // Fallback to x-usage header for non-stream responses
      const headers = response.headers || {};
      const usageHeader = headers['x-usage'] || headers['X-Usage'];
      if (typeof usageHeader === 'string' && usageHeader.length > 0) {
        try {
          const parsed = JSON.parse(usageHeader);
          const cost = parsed?.total_cost ?? parsed?.total_cost_usd ?? parsed?.cost ?? parsed?.usd;
          if (cost != null) {
            const n = Number(cost);
            if (Number.isFinite(n)) {
              console.log('[OpenRouterUsageExtractor] Found cost in x-usage header:', n);
              return n;
            }
          }
        } catch {
          // Try regex fallback
          const m =
            usageHeader.match(/total[_-]?cost[_usd]*=([0-9.]+)/i) ||
            usageHeader.match(/cost=([0-9.]+)/i);
          if (m && m[1]) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) {
              console.log('[OpenRouterUsageExtractor] Found cost in x-usage header (regex):', n);
              return n;
            }
          }
        }
      }
    } catch (error) {
      console.error(
        '[OpenRouterUsageExtractor] Error extracting USD cost from OpenRouter response:',
        error
      );
    }
    return undefined;
  }
}
