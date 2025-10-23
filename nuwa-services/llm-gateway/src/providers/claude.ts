import axios, { AxiosResponse } from "axios";
import { BaseLLMProvider } from "./BaseLLMProvider.js";
import { TestableLLMProvider } from "./LLMProvider.js";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";
import { ClaudeUsageExtractor } from "../billing/usage/providers/ClaudeUsageExtractor.js";
import { ClaudeStreamProcessor } from "../billing/usage/providers/ClaudeStreamProcessor.js";
import { CLAUDE_PATHS } from "./constants.js";

/**
 * Claude Provider Implementation
 * Handles Anthropic Claude API requests with proper authentication and usage tracking
 */
export class ClaudeProvider extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;
  
  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [
    CLAUDE_PATHS.MESSAGES
  ] as const;

  constructor() {
    super();
    this.baseURL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  }

  /**
   * Prepare request data for Claude API
   * Ensures proper parameter format and adds required headers
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Claude API specific parameter handling
    const preparedData = { ...data };

    // Ensure max_tokens is set (required by Claude API)
    if (!preparedData.max_tokens) {
      preparedData.max_tokens = 1024; // Default value
    }

    // Claude uses 'messages' array like OpenAI Chat Completions
    // No special transformation needed for basic requests

    return preparedData;
  }

  /**
   * Forward request to Claude API
   */
  async forwardRequest(
    apiKey: string | null,
    path: string,
    method: string = "POST",
    data?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null> {
    try {
      // Add API key header (required for Claude)
      if (!apiKey) {
        return {
          error: "API key is required for Claude provider",
          status: 401
        };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01", // Required by Claude API
        "Authorization": `Bearer ${apiKey}`
      };

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(data, isStream);

      const fullUrl = `${this.baseURL}${path}`;
      console.log(`🔄 Forwarding ${method} request to Claude: ${fullUrl}, data: ${JSON.stringify(finalData)}`);

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: finalData,
        headers,
        responseType: isStream ? "stream" : "json",
      });

      return response;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      return {
        error: errorInfo.message,
        status: errorInfo.statusCode,
        details: errorInfo.details
      };
    }
  }

  /**
   * Parse Claude response and extract relevant information
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;
      
      // Claude API returns response in a specific format
      // Basic parsing - detailed usage extraction is handled by ClaudeUsageExtractor
      return {
        ...data,
        provider: 'claude'
      };
    } catch (error) {
      console.error('❌ Error parsing Claude response:', error);
      return response.data;
    }
  }

  /**
   * Extract USD cost from Claude response (if available)
   * Claude doesn't typically provide cost in response, so return undefined
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    // Claude API doesn't provide cost in response
    return undefined;
  }

  /**
   * Create Claude-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new ClaudeUsageExtractor();
  }

  /**
   * Create Claude-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new ClaudeStreamProcessor(model, initialCost);
  }


  /**
   * Get test models for Claude provider
   * Implementation of TestableLLMProvider interface
   */
  getTestModels(): string[] {
    return [
      'claude-3-5-haiku-20241022',
      'claude-sonnet-4-5-20250929',
    ];
  }

  /**
   * Get default test options
   * Implementation of TestableLLMProvider interface
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'claude-3-5-haiku-20241022',
      message: 'Hello! Please respond with a brief greeting.',
      maxTokens: 100,
      temperature: 0.7
    };
  }

  /**
   * Create test request for the given endpoint
   * Implementation of TestableLLMProvider interface
   */
  createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
    const defaults = this.getDefaultTestOptions();
    
    if (endpoint === CLAUDE_PATHS.MESSAGES) {
      // Extract normalized options and map to API parameter names
      const { maxTokens, message, messages, ...rest } = options;
      
      return {
        model: options.model || defaults.model,
        max_tokens: maxTokens || defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
        messages: messages || [
          { role: 'user', content: message || defaults.message }
        ],
        stream: options.stream || false,
        ...rest  // Include any additional options
      };
    }
    
    throw new Error(`Unknown endpoint for Claude provider: ${endpoint}`);
  }
}

// Export singleton instance
export const claudeProvider = new ClaudeProvider();
