import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { GoogleUsageExtractor } from './GoogleUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * Google Gemini-specific stream processor
 * Handles Google's streaming format with usage metadata
 */
export class GoogleStreamProcessor extends BaseStreamProcessor {
  private cumulativePromptTokens: number = 0;
  private cumulativeCandidatesTokens: number = 0;
  private hasReceivedFinalUsage: boolean = false;

  constructor(model: string, initialProviderCost?: number) {
    const extractor = new GoogleUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * Google-specific chunk processing
   * Accumulates usage information from stream chunks
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Google streams usage information in the response chunks
    // We need to accumulate the total usage as we receive updates
    this.accumulateGoogleUsage(chunkText);
  }

  /**
   * Accumulate usage information from Google streaming chunks
   * Google sends usage metadata in the stream data
   */
  private accumulateGoogleUsage(chunkText: string): void {
    try {
      const lines = chunkText.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Google streaming format uses JSON objects, sometimes prefixed with "data: "
        if (trimmedLine.startsWith('data: ')) {
          const dataStr = trimmedLine.slice(6);
          if (dataStr === '[DONE]') {
            this.hasReceivedFinalUsage = true;
            console.log('[GoogleStreamProcessor] Received [DONE] signal - finalizing usage');
            continue;
          }
          try {
            const data = JSON.parse(dataStr);
            this.processGoogleUsageData(data);
          } catch (parseError) {
            // Not JSON, skip
          }
        } else if (trimmedLine.startsWith('{')) {
          // Try to parse as direct JSON
          try {
            const data = JSON.parse(trimmedLine);
            this.processGoogleUsageData(data);
          } catch (parseError) {
            // Not valid JSON, skip
          }
        }
      }
    } catch (error) {
      console.error('[GoogleStreamProcessor] Error accumulating Google usage:', error);
    }
  }

  /**
   * Process usage data from a Google stream chunk
   */
  private processGoogleUsageData(data: any): void {
    try {
      if (!data || typeof data !== 'object') {
        return;
      }

      // Check if usageMetadata is present
      const usageMetadata = data.usageMetadata;
      if (usageMetadata && typeof usageMetadata === 'object') {
        console.log('[GoogleStreamProcessor] Processing usage metadata:', usageMetadata);

        // Google sends cumulative counts, so we can directly use the values
        if (typeof usageMetadata.promptTokenCount === 'number') {
          this.cumulativePromptTokens = Math.max(
            this.cumulativePromptTokens,
            usageMetadata.promptTokenCount
          );
        }

        if (typeof usageMetadata.candidatesTokenCount === 'number') {
          this.cumulativeCandidatesTokens = Math.max(
            this.cumulativeCandidatesTokens,
            usageMetadata.candidatesTokenCount
          );
        }

        // Update the accumulated usage in the base class
        this.updateAccumulatedUsage();
      }
    } catch (error) {
      console.error('[GoogleStreamProcessor] Error processing Google usage data:', error);
    }
  }

  /**
   * Update the accumulated usage with current cumulative values
   */
  private updateAccumulatedUsage(): void {
    const totalTokens = this.cumulativePromptTokens + this.cumulativeCandidatesTokens;

    this.accumulatedUsage = {
      promptTokens: this.cumulativePromptTokens,
      completionTokens: this.cumulativeCandidatesTokens,
      totalTokens: totalTokens,
    };

    console.log('[GoogleStreamProcessor] Updated accumulated usage:', this.accumulatedUsage);
  }

  /**
   * Override getFinalUsage to ensure we return the accumulated usage
   */
  getFinalUsage(): UsageInfo | null {
    // Make sure we have the latest accumulated usage
    if (this.cumulativePromptTokens > 0 || this.cumulativeCandidatesTokens > 0) {
      this.updateAccumulatedUsage();
    }

    return this.accumulatedUsage;
  }

  /**
   * Override reset to clear Google-specific state
   */
  reset(): void {
    super.reset();
    this.cumulativePromptTokens = 0;
    this.cumulativeCandidatesTokens = 0;
    this.hasReceivedFinalUsage = false;
  }
}
