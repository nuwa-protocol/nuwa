import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { OpenRouterUsageExtractor } from './OpenRouterUsageExtractor.js';

/**
 * OpenRouter-specific stream processor
 * Handles OpenRouter's Chat Completions streaming format with cost information
 */
export class OpenRouterStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialProviderCost?: number) {
    const extractor = new OpenRouterUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * OpenRouter-specific chunk processing
   * OpenRouter typically doesn't need special response body accumulation
   * since it uses standard Chat Completions format
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // OpenRouter uses standard Chat Completions format
    // No special processing needed beyond what the base class does
    
    // Could add OpenRouter-specific logging or monitoring here if needed
    if (chunkText.includes('"cost"')) {
      console.log('[OpenRouterStreamProcessor] Detected cost information in chunk');
    }
  }

  /**
   * OpenRouter doesn't typically need response body accumulation
   * since it uses standard Chat Completions format without complex tool structures
   */
  protected tryExtractResponseBody(chunkText: string): void {
    // OpenRouter uses standard Chat Completions format
    // Response body accumulation is typically not needed
    // Override with empty implementation to avoid unnecessary processing
  }
}
