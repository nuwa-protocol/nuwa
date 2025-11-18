import { AxiosResponse } from 'axios';
import { BaseUsageExtractor } from '../base/BaseUsageExtractor.js';
import { UsageInfo } from '../../pricing.js';

/**
 * Gemini-specific usage extractor
 * Handles Gemini's usageMetadata format for both streaming and non-streaming responses
 */
export class GeminiUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('gemini');
  }

  /**
   * Extract usage from Gemini response body
   * Gemini uses usageMetadata field with promptTokenCount, candidatesTokenCount, totalTokenCount
   */
  extractFromResponseBody(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      // Check for usageMetadata field (Gemini's standard format)
      if (responseBody.usageMetadata && typeof responseBody.usageMetadata === 'object') {
        return this.extractUsageMetadata(responseBody.usageMetadata);
      }

      // Fallback: check for OpenAI-compatible usage field
      if (responseBody.usage && typeof responseBody.usage === 'object') {
        return this.extractChatCompletionUsage(responseBody.usage);
      }

      return null;
    } catch (error) {
      console.error('[GeminiUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from Gemini streaming chunk
   * Gemini streams SSE format with usageMetadata in final chunks
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and [DONE] marker
        if (!trimmed || trimmed === '[DONE]') {
          continue;
        }

        // Handle Gemini streaming format: data: {...}
        if (trimmed.startsWith('data: ')) {
          const result = this.extractFromStreamData(trimmed);
          if (result) {
            return result;
          }
        }
      }
    } catch (error) {
      console.error('[GeminiUsageExtractor] Error extracting usage from stream chunk:', error);
      console.error('Chunk text:', chunkText.slice(0, 200));
    }

    return null;
  }

  /**
   * Gemini doesn't provide native USD cost - returns undefined
   */
  extractProviderCost(response: AxiosResponse): number | undefined {
    return undefined; // Gemini doesn't provide cost in response
  }

  /**
   * Extract usage from Gemini's usageMetadata format
   * Converts Gemini field names to standard UsageInfo format
   */
  private extractUsageMetadata(usageMetadata: any): UsageInfo {
    return {
      promptTokens: usageMetadata.promptTokenCount || 0,
      completionTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    };
  }

  /**
   * Extract usage from streaming data line
   */
  private extractFromStreamData(trimmed: string): { usage: UsageInfo; cost?: number } | null {
    const dataStr = trimmed.slice(6); // Remove 'data: ' prefix
    if (dataStr === '[DONE]') return null;

    try {
      const data = JSON.parse(dataStr);

      // Check for usageMetadata in streaming response
      if (data.usageMetadata && typeof data.usageMetadata === 'object') {
        return {
          usage: this.extractUsageMetadata(data.usageMetadata),
        };
      }

      // Fallback: check for OpenAI-compatible usage field
      if (data.usage && typeof data.usage === 'object') {
        return {
          usage: this.extractChatCompletionUsage(data.usage),
        };
      }

      return null;
    } catch (parseError) {
      console.error('[GeminiUsageExtractor] Error parsing streaming data:', parseError);
      return null;
    }
  }
}
