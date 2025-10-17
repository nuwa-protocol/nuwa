import { BaseStreamProcessor } from './base/BaseStreamProcessor.js';
import { DefaultUsageExtractor } from './DefaultUsageExtractor.js';

/**
 * Default concrete implementation of StreamProcessor
 * Used as fallback when no provider-specific processor is available
 */
export class DefaultStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, extractor: DefaultUsageExtractor, initialProviderCost?: number) {
    super(model, extractor, initialProviderCost);
  }

  /**
   * Default chunk processing - no provider-specific logic needed
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Default implementation does nothing special
    // All processing is handled by the base class
  }

  /**
   * Default response body extraction - handles both Chat Completions and Response API
   */
  protected tryExtractResponseBody(chunkText: string): void {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Look for Response API completion event
        if (trimmed.startsWith('event: response.completed')) {
          const nextLineIndex = lines.indexOf(line) + 1;
          if (nextLineIndex < lines.length) {
            const dataLine = lines[nextLineIndex].trim();
            if (dataLine.startsWith('data: ')) {
              const dataStr = dataLine.slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.response) {
                  // Store the complete response for potential tool call parsing
                  this.accumulatedResponseBody = data.response;
                  console.log('[DefaultStreamProcessor] Accumulated Response API response body');
                }
              } catch (parseError) {
                console.error('[DefaultStreamProcessor] Error parsing response body:', parseError);
              }
            }
          }
        }
        
        // For Chat Completions, we could also accumulate the final response
        // but it's typically not needed for cost calculation
      }
    } catch (error) {
      console.error('[DefaultStreamProcessor] Error extracting response body:', error);
    }
  }
}
