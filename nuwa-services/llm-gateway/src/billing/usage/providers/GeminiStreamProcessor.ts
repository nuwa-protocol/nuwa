import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { GeminiUsageExtractor } from './GeminiUsageExtractor.js';

/**
 * Gemini-specific stream processor
 * Handles Gemini's streaming response format with usageMetadata
 */
export class GeminiStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialProviderCost?: number) {
    const extractor = new GeminiUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * Gemini-specific chunk processing
   * Can be extended to handle Gemini-specific features like safety ratings
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Gemini may include safety ratings and other metadata
    // For now, we just log if safety ratings are present
    if (chunkText.includes('safetyRatings')) {
      // Safety ratings detected - could be logged or processed if needed
      // console.log('[GeminiStreamProcessor] Safety ratings detected in chunk');
    }
  }
}
