import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { LiteLLMUsageExtractor } from './LiteLLMUsageExtractor.js';

/**
 * LiteLLM-specific stream processor
 * Handles LiteLLM's Chat Completions streaming format with header-based cost information
 */
export class LiteLLMStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialProviderCost?: number) {
    const extractor = new LiteLLMUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * LiteLLM-specific chunk processing
   * LiteLLM uses standard Chat Completions format, so no special processing needed
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // LiteLLM uses standard Chat Completions format
    // No special processing needed beyond what the base class does

    // Could add LiteLLM-specific logging or monitoring here if needed
    if (chunkText.includes('litellm')) {
      console.log('[LiteLLMStreamProcessor] Detected LiteLLM-specific information in chunk');
    }
  }

  /**
   * LiteLLM doesn't typically need response body accumulation
   * since it uses standard Chat Completions format
   */
  protected tryExtractResponseBody(chunkText: string): void {
    // LiteLLM uses standard Chat Completions format
    // Response body accumulation is typically not needed
    // Override with empty implementation to avoid unnecessary processing
  }
}
