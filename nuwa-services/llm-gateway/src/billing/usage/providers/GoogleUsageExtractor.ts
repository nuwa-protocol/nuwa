import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * Google Gemini-specific usage extractor
 * Handles Google Gemini API response formats for both streaming and non-streaming requests
 */
export class GoogleUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('google');
  }

  /**
   * Extract usage from Google Gemini response body
   * Google API returns usage in usageMetadata field
   */
  extractFromResponseBody(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      const usageMetadata = responseBody.usageMetadata;
      if (!usageMetadata || typeof usageMetadata !== 'object') {
        return null;
      }

      console.log('[GoogleUsageExtractor] Extracting Google usage from response body');

      // Google API uses promptTokenCount, candidatesTokenCount, and totalTokenCount
      const promptTokens = usageMetadata.promptTokenCount || 0;
      const completionTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens;

      const result: UsageInfo = {
        promptTokens,
        completionTokens,
        totalTokens,
      };

      console.log('[GoogleUsageExtractor] Extracted usage:', result);
      return result;
    } catch (error) {
      console.error('[GoogleUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from Google Gemini streaming chunk
   * Google uses Server-Sent Events with JSON data
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Google streaming format uses JSON objects, sometimes prefixed with "data: "
        if (trimmedLine.startsWith('data: ')) {
          const dataStr = trimmedLine.slice(6);
          if (dataStr === '[DONE]') {
            continue;
          }
          try {
            const data = JSON.parse(dataStr);
            const usage = this.extractGoogleUsageFromStreamData(data);
            if (usage) {
              console.log('[GoogleUsageExtractor] Found usage in stream chunk:', usage);
              return { usage };
            }
          } catch (parseError) {
            // Not JSON, skip
          }
        } else if (trimmedLine.startsWith('{')) {
          // Try to parse as direct JSON
          try {
            const data = JSON.parse(trimmedLine);
            const usage = this.extractGoogleUsageFromStreamData(data);
            if (usage) {
              console.log('[GoogleUsageExtractor] Found usage in stream chunk:', usage);
              return { usage };
            }
          } catch (parseError) {
            // Not valid JSON, skip
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[GoogleUsageExtractor] Error extracting usage from stream chunk:', error);
      return null;
    }
  }

  /**
   * Extract provider-specific cost from Google response
   * Google doesn't provide cost information in responses
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    // Google API doesn't provide cost information in responses
    return undefined;
  }

  /**
   * Extract usage information from Google stream data
   */
  private extractGoogleUsageFromStreamData(data: any): UsageInfo | null {
    try {
      if (!data || typeof data !== 'object') {
        return null;
      }

      // Check if usageMetadata is present
      const usageMetadata = data.usageMetadata;
      if (usageMetadata && typeof usageMetadata === 'object') {
        const promptTokens = usageMetadata.promptTokenCount || 0;
        const completionTokens = usageMetadata.candidatesTokenCount || 0;
        const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens;

        // Only return usage if we have meaningful token counts
        if (promptTokens > 0 || completionTokens > 0 || totalTokens > 0) {
          return {
            promptTokens,
            completionTokens,
            totalTokens,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[GoogleUsageExtractor] Error extracting usage from stream data:', error);
      return null;
    }
  }
}
