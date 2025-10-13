import { Request, Response } from 'express';
import { pricingRegistry, UsageInfo, PricingResult } from './pricing.js';

/**
 * Usage policy for handling token-based billing
 * Extracts usage from responses and calculates costs when needed
 */
export class UsagePolicy {
  /**
   * Extract usage information from non-streaming response
   */
  static extractUsageFromResponse(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      const usage = responseBody.usage;
      if (!usage || typeof usage !== 'object') {
        return null;
      }

      return {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      };
    } catch (error) {
      console.error('Error extracting usage from response:', error);
      return null;
    }
  }

  /**
   * Extract usage from streaming SSE data
   * Looks for usage information in the final chunks
   */
  static extractUsageFromStreamChunk(chunkText: string): UsageInfo | null {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ') && trimmed.includes('"usage"')) {
          const dataStr = trimmed.slice(6); // Remove 'data: ' prefix
          if (dataStr === '[DONE]') continue;
          
          const data = JSON.parse(dataStr);
          if (data.usage) {
            return {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0),
            };
          }
        }
      }
    } catch (error) {
      console.debug('Error extracting usage from stream chunk:', error);
    }
    
    return null;
  }

  /**
   * Inject stream_options.include_usage for OpenAI requests
   */
  static injectStreamUsageOption(requestData: any): any {
    if (!requestData || typeof requestData !== 'object') {
      return requestData;
    }

    // Only inject for streaming requests
    if (!requestData.stream) {
      return requestData;
    }

    return {
      ...requestData,
      stream_options: {
        include_usage: true,
        ...(requestData.stream_options || {})
      }
    };
  }

  /**
   * Calculate cost for a request, preferring provider cost over gateway pricing
   */
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo
  ): PricingResult | null {
    // Prefer provider-supplied cost if available
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      return {
        costUsd: providerCostUsd,
        source: 'provider',
        model,
        usage,
      };
    }

    // Fallback to gateway pricing calculation
    if (usage && (usage.promptTokens || usage.completionTokens)) {
      const result = pricingRegistry.calculateCost(model, usage);
      if (result) {
        return result;
      }
    }

    // No cost calculation possible
    console.warn(`Unable to calculate cost for model ${model}, usage:`, usage);
    return null;
  }

  /**
   * Set usage cost in response locals for PaymentKit billing
   */
  static setResponseUsage(res: Response, costUsd: number, source: string): void {
    try {
      const picoUsd = Math.round(Number(costUsd || 0) * 1e12);
      (res as any).locals = (res as any).locals || {};
      (res as any).locals.usage = picoUsd;
      
      // Also set in access log for tracking
      if ((res as any).locals.accessLog) {
        (res as any).locals.accessLog.total_cost_usd = costUsd;
        (res as any).locals.accessLog.usage_source = source;
        (res as any).locals.accessLog.pricing_version = pricingRegistry.getVersion();
      }
    } catch (error) {
      console.error('Error setting response usage:', error);
    }
  }

  /**
   * Process non-streaming response for billing
   */
  static processNonStreamResponse(
    model: string,
    responseBody: any,
    providerCostUsd?: number
  ): PricingResult | null {
    const usage = this.extractUsageFromResponse(responseBody);
    return this.calculateRequestCost(model, providerCostUsd, usage || undefined);
  }

  /**
   * Create a stream processor for billing
   * Returns a function that processes chunks and returns final cost
   */
  static createStreamProcessor(model: string, providerCostUsd?: number) {
    let accumulatedUsage: UsageInfo | null = null;
    let finalCost: PricingResult | null = null;

    return {
      processChunk: (chunkText: string): void => {
        const usage = this.extractUsageFromStreamChunk(chunkText);
        if (usage) {
          accumulatedUsage = usage;
          finalCost = this.calculateRequestCost(model, providerCostUsd, usage);
        }
      },
      
      getFinalCost: (): PricingResult | null => {
        return finalCost;
      },

      getUsage: (): UsageInfo | null => {
        return accumulatedUsage;
      }
    };
  }

}
