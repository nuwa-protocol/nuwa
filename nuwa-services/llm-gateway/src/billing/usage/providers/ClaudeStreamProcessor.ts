import { BaseStreamProcessor } from '../base/BaseStreamProcessor.js';
import { ClaudeUsageExtractor } from './ClaudeUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * Claude-specific stream processor
 * Handles Claude's Server-Sent Events format with incremental usage updates
 */
export class ClaudeStreamProcessor extends BaseStreamProcessor {
  private cumulativeInputTokens: number = 0;
  private cumulativeOutputTokens: number = 0;
  private hasReceivedFinalUsage: boolean = false;

  constructor(model: string, initialProviderCost?: number) {
    const extractor = new ClaudeUsageExtractor();
    super(model, extractor, initialProviderCost);
  }

  /**
   * Claude-specific chunk processing
   * Accumulates usage information from multiple events
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Claude streams usage information across multiple events
    // We need to accumulate the total usage as we receive updates
    this.accumulateClaudeUsage(chunkText);
  }

  /**
   * Accumulate usage information from Claude streaming events
   * Claude sends usage updates in message_start and message_delta events
   */
  private accumulateClaudeUsage(chunkText: string): void {
    try {
      const lines = chunkText.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();

          // Process events that contain usage information
          if (eventType === 'message_start' || eventType === 'message_delta') {
            const nextLineIndex = i + 1;
            if (nextLineIndex < lines.length) {
              const dataLine = lines[nextLineIndex].trim();
              if (dataLine.startsWith('data: ')) {
                const dataStr = dataLine.slice(6);
                try {
                  const data = JSON.parse(dataStr);
                  this.processClaudeUsageEvent(data, eventType);
                } catch (parseError) {
                  console.error(
                    `[ClaudeStreamProcessor] Error parsing ${eventType} data:`,
                    parseError
                  );
                }
              }
            }
          } else if (eventType === 'message_stop') {
            // message_stop indicates the end of the stream
            this.hasReceivedFinalUsage = true;
            console.log('[ClaudeStreamProcessor] Received message_stop event - finalizing usage');
          }
        }
      }
    } catch (error) {
      console.error('[ClaudeStreamProcessor] Error accumulating Claude usage:', error);
    }
  }

  /**
   * Process usage information from a specific Claude event
   */
  private processClaudeUsageEvent(data: any, eventType: string): void {
    try {
      let usage: any = null;

      if (eventType === 'message_start') {
        // message_start typically contains initial input_tokens
        if (data.message && data.message.usage) {
          usage = data.message.usage;
          console.log('[ClaudeStreamProcessor] Processing message_start usage:', usage);
        }
      } else if (eventType === 'message_delta') {
        // message_delta contains incremental output_tokens
        if (data.delta && data.delta.usage) {
          usage = data.delta.usage;
          console.log('[ClaudeStreamProcessor] Processing message_delta usage:', usage);
        }
      }

      if (usage && typeof usage === 'object') {
        // Accumulate tokens (Claude may send multiple delta events)
        if (typeof usage.input_tokens === 'number') {
          this.cumulativeInputTokens = Math.max(this.cumulativeInputTokens, usage.input_tokens);
        }

        if (typeof usage.output_tokens === 'number') {
          // For output tokens, we accumulate since they come in deltas
          this.cumulativeOutputTokens = Math.max(this.cumulativeOutputTokens, usage.output_tokens);
        }

        // Update the accumulated usage in the base class
        this.updateAccumulatedUsage();
      }
    } catch (error) {
      console.error(`[ClaudeStreamProcessor] Error processing ${eventType} usage event:`, error);
    }
  }

  /**
   * Update the accumulated usage with current cumulative values
   */
  private updateAccumulatedUsage(): void {
    const totalTokens = this.cumulativeInputTokens + this.cumulativeOutputTokens;

    this.accumulatedUsage = {
      promptTokens: this.cumulativeInputTokens,
      completionTokens: this.cumulativeOutputTokens,
      totalTokens: totalTokens,
    };

    console.log('[ClaudeStreamProcessor] Updated accumulated usage:', this.accumulatedUsage);
  }

  /**
   * Override getFinalUsage to ensure we return the accumulated usage
   */
  getFinalUsage(): UsageInfo | null {
    // Make sure we have the latest accumulated usage
    if (this.cumulativeInputTokens > 0 || this.cumulativeOutputTokens > 0) {
      this.updateAccumulatedUsage();
    }

    return this.accumulatedUsage;
  }

  /**
   * Override reset to clear Claude-specific state
   */
  reset(): void {
    super.reset();
    this.cumulativeInputTokens = 0;
    this.cumulativeOutputTokens = 0;
    this.hasReceivedFinalUsage = false;
  }
}
