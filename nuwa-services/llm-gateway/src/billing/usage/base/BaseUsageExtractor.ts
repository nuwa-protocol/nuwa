import { AxiosResponse } from 'axios';
import { UsageExtractor } from '../interfaces/UsageExtractor.js';
import { UsageInfo, PricingResult, pricingRegistry } from '../../pricing.js';

/**
 * Base implementation of UsageExtractor with common functionality
 * Provider-specific extractors can extend this class
 */
export abstract class BaseUsageExtractor implements UsageExtractor {
  protected provider: string;

  /**
   * Constructor
   * @param provider Provider name (e.g., 'openai', 'claude')
   */
  constructor(provider: string) {
    this.provider = provider;
  }

  /**
   * Extract usage information from a non-streaming response
   * Default implementation delegates to extractFromResponseBody
   */
  extractFromResponse(response: AxiosResponse): UsageInfo | null {
    try {
      return this.extractFromResponseBody(response.data);
    } catch (error) {
      console.error(`[${this.constructor.name}] Error extracting usage from response:`, error);
      return null;
    }
  }

  /**
   * Extract usage information from response body
   * Must be implemented by provider-specific classes
   */
  abstract extractFromResponseBody(responseBody: any): UsageInfo | null;

  /**
   * Extract usage information from streaming chunk
   * Must be implemented by provider-specific classes
   */
  abstract extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null;

  /**
   * Calculate cost using gateway pricing registry with provider-specific pricing
   * Can be overridden by providers that have different cost calculation logic
   */
  calculateCost(model: string, usage: UsageInfo): PricingResult | null {
    try {
      if (!usage || (!usage.promptTokens && !usage.completionTokens)) {
        return null;
      }

      // Use provider-specific pricing
      const result = pricingRegistry.calculateProviderCost(this.provider, model, usage);
      if (result) {
        console.log(
          `[${this.constructor.name}] Calculated cost for ${this.provider}/${model}: $${result.costUsd}`
        );
        return result;
      }

      // No pricing found for this provider/model combination
      console.warn(`[${this.constructor.name}] No pricing found for ${this.provider}/${model}`);
      return null;
    } catch (error) {
      console.error(`[${this.constructor.name}] Error calculating cost:`, error);
      return null;
    }
  }

  /**
   * Extract provider-specific USD cost from response
   * Default implementation returns undefined (no provider cost available)
   * Override in provider-specific classes if they provide native cost
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    return undefined;
  }

  /**
   * Helper method to check if usage object is from Response API format
   */
  protected isResponseAPIUsage(usage: any): boolean {
    if (!usage || typeof usage !== 'object') {
      return false;
    }
    // Response API uses input_tokens/output_tokens instead of prompt_tokens/completion_tokens
    return !!(usage.input_tokens !== undefined && usage.output_tokens !== undefined);
  }

  /**
   * Helper method to extract usage from Response API format
   */
  protected extractResponseAPIUsage(usage: any): UsageInfo {
    const baseInputTokens = usage.input_tokens || 0;
    const baseOutputTokens = usage.output_tokens || 0;

    // Extract tool-related tokens dynamically
    let toolTokens = 0;
    const keys = Object.keys(usage);

    for (const key of keys) {
      // Match all *_tokens fields except the standard ones
      if (
        key.endsWith('_tokens') &&
        key !== 'input_tokens' &&
        key !== 'output_tokens' &&
        key !== 'total_tokens'
      ) {
        const tokenValue = usage[key];
        if (typeof tokenValue === 'number' && tokenValue > 0) {
          toolTokens += tokenValue;
          console.log(`[${this.constructor.name}] Found tool tokens: ${key} = ${tokenValue}`);
        }
      }
    }

    // Tool tokens are typically added to input tokens
    const promptTokens = baseInputTokens + toolTokens;
    const completionTokens = baseOutputTokens;
    const totalTokens = usage.total_tokens || promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  /**
   * Helper method to extract usage from Chat Completions API format
   */
  protected extractChatCompletionUsage(usage: any): UsageInfo {
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens:
        usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    };
  }

  /**
   * Helper method to extract usage from streaming data (unified for both API types)
   */
  protected extractUsageFromStreamData(usage: any): UsageInfo {
    if (this.isResponseAPIUsage(usage)) {
      return this.extractResponseAPIUsage(usage);
    } else {
      return this.extractChatCompletionUsage(usage);
    }
  }
}
