import { BaseUsageExtractor } from './base/BaseUsageExtractor.js';
import { UsageInfo } from '../pricing.js';

/**
 * Default concrete implementation of UsageExtractor
 * Used as fallback when no provider-specific extractor is available
 */
export class DefaultUsageExtractor extends BaseUsageExtractor {
  /**
   * Extract usage from response body using default logic
   * Supports both Chat Completions and Response API formats
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

      // Check if this is a Response API response with extended usage info
      if (this.isResponseAPIUsage(usage)) {
        console.log('[DefaultUsageExtractor] Extracting Response API usage');
        return this.extractResponseAPIUsage(usage);
      } else {
        console.log('[DefaultUsageExtractor] Extracting Chat Completions usage');
        return this.extractChatCompletionUsage(usage);
      }
    } catch (error) {
      console.error('[DefaultUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  /**
   * Extract usage from streaming chunk using default logic
   * Supports both Chat Completions and Response API streaming formats
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Handle Response API format: event: response.completed
        if (trimmed.startsWith('event: response.completed')) {
          const result = this.extractResponseAPIFromStream(lines, line);
          if (result) {
            console.log('[DefaultUsageExtractor] Extracted Response API usage from stream:', result.usage);
            return result;
          }
          continue;
        }
        
        // Handle Chat Completions API format: data: {...usage...}
        if (trimmed.startsWith('data: ') && trimmed.includes('"usage"')) {
          const result = this.extractChatCompletionsFromStream(trimmed);
          if (result) {
            console.log('[DefaultUsageExtractor] Extracted Chat Completions usage from stream:', result.usage);
            return result;
          }
        }
      }
    } catch (error) {
      console.error('[DefaultUsageExtractor] Error extracting usage from stream chunk:', error);
      console.error('Chunk text:', chunkText.slice(0, 200));
    }
    
    return null;
  }

  /**
   * Extract Response API usage from streaming data
   */
  private extractResponseAPIFromStream(lines: string[], currentLine: string): { usage: UsageInfo; cost?: number } | null {
    // Look for the next data line
    const nextLineIndex = lines.indexOf(currentLine) + 1;
    if (nextLineIndex < lines.length) {
      const dataLine = lines[nextLineIndex].trim();
      if (dataLine.startsWith('data: ')) {
        const dataStr = dataLine.slice(6);
        try {
          const data = JSON.parse(dataStr);
          // Response API: usage is at data.response.usage
          if (data.response && data.response.usage) {
            const result: { usage: UsageInfo; cost?: number } = {
              usage: this.extractUsageFromStreamData(data.response.usage)
            };
            
            // Check for cost information
            if (typeof data.response.usage.cost === 'number') {
              result.cost = data.response.usage.cost;
            }
            
            return result;
          }
        } catch (parseError) {
          console.error('[DefaultUsageExtractor] Error parsing Response API data:', parseError);
        }
      }
    }
    return null;
  }

  /**
   * Extract Chat Completions usage from streaming data
   */
  private extractChatCompletionsFromStream(trimmed: string): { usage: UsageInfo; cost?: number } | null {
    const dataStr = trimmed.slice(6); // Remove 'data: ' prefix
    if (dataStr === '[DONE]') return null;
    
    try {
      const data = JSON.parse(dataStr);
      // Chat Completions API: usage is at root level
      if (data.usage) {
        const result: { usage: UsageInfo; cost?: number } = {
          usage: this.extractUsageFromStreamData(data.usage)
        };
        
        // Check for cost information
        if (typeof data.usage.cost === 'number') {
          result.cost = data.usage.cost;
        }
        
        return result;
      }
    } catch (parseError) {
      console.error('[DefaultUsageExtractor] Error parsing Chat Completions data:', parseError);
    }
    
    return null;
  }
}
