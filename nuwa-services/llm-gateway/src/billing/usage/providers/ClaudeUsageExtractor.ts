import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * Claude-specific usage extractor
 * Handles Claude API response formats for both streaming and non-streaming requests
 */
export class ClaudeUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('claude');
  }

  /**
   * Extract usage from Claude response body
   * Claude API returns usage in a specific format
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

      console.log('[ClaudeUsageExtractor] Extracting Claude usage from response body');
      
      // Claude API uses input_tokens and output_tokens
      const promptTokens = usage.input_tokens || 0;
      const completionTokens = usage.output_tokens || 0;
      const totalTokens = promptTokens + completionTokens;

      const result: UsageInfo = {
        promptTokens,
        completionTokens,
        totalTokens
      };

      console.log('[ClaudeUsageExtractor] Extracted usage:', result);
      return result;
    } catch (error) {
      console.error('[ClaudeUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from Claude streaming chunk
   * Claude uses Server-Sent Events with specific event types
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for Claude-specific events
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();
          
          // Check for events that contain usage information
          if (eventType === 'message_start' || eventType === 'message_delta') {
            // Look for the next data line
            const nextLineIndex = i + 1;
            if (nextLineIndex < lines.length) {
              const dataLine = lines[nextLineIndex].trim();
              if (dataLine.startsWith('data: ')) {
                const dataStr = dataLine.slice(6);
                try {
                  const data = JSON.parse(dataStr);
                  const usage = this.extractUsageFromEventData(data, eventType);
                  if (usage) {
                    console.log(`[ClaudeUsageExtractor] Found usage in ${eventType} event:`, usage);
                    return { usage };
                  }
                } catch (parseError) {
                  console.error(`[ClaudeUsageExtractor] Error parsing ${eventType} data:`, parseError);
                }
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[ClaudeUsageExtractor] Error extracting usage from stream chunk:', error);
      return null;
    }
  }

  /**
   * Extract provider-specific cost from Claude response
   * Claude doesn't provide cost information in responses
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    // Claude API doesn't provide cost information in responses
    return undefined;
  }

  /**
   * Extract usage information from Claude event data
   * Handles different event types that may contain usage information
   */
  private extractUsageFromEventData(data: any, eventType: string): UsageInfo | null {
    try {
      let usage: any = null;

      if (eventType === 'message_start') {
        // message_start event contains initial usage (usually just input_tokens)
        // Format: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}
        if (data.message && data.message.usage) {
          usage = data.message.usage;
        }
      } else if (eventType === 'message_delta') {
        // message_delta event contains incremental usage updates
        // Format: {"type":"message_delta","delta":{"usage":{"output_tokens":5}}}
        if (data.delta && data.delta.usage) {
          usage = data.delta.usage;
        }
      }

      if (usage && typeof usage === 'object') {
        const promptTokens = usage.input_tokens || 0;
        const completionTokens = usage.output_tokens || 0;
        const totalTokens = promptTokens + completionTokens;

        // Only return usage if we have meaningful token counts
        if (promptTokens > 0 || completionTokens > 0) {
          return {
            promptTokens,
            completionTokens,
            totalTokens
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`[ClaudeUsageExtractor] Error extracting usage from ${eventType} event data:`, error);
      return null;
    }
  }
}
