import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { OpenAIUsageExtractor } from './OpenAIUsageExtractor.js';

/**
 * OpenAI-specific stream processor
 * Handles both Chat Completions and Response API streaming formats
 */
export class OpenAIStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialProviderCost?: number) {
    const extractor = new OpenAIUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * OpenAI-specific chunk processing
   * Handles Response API response body accumulation for tool call parsing
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Try to accumulate Response API response body for tool parsing
    this.tryExtractResponseBody(chunkText);
  }

  /**
   * Try to extract complete response body from OpenAI streaming chunks
   * This is specifically for Response API which may need tool call parsing
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
                  console.log('[OpenAIStreamProcessor] Accumulated Response API response body');
                }
              } catch (parseError) {
                console.error('[OpenAIStreamProcessor] Error parsing response body:', parseError);
              }
            }
          }
        }

        // For Chat Completions, we could also accumulate the final response
        // but it's typically not needed for cost calculation
      }
    } catch (error) {
      console.error('[OpenAIStreamProcessor] Error extracting response body:', error);
    }
  }
}
