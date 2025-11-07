// 添加axios导入
import axios, { AxiosResponse } from 'axios';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { TestableLLMProvider } from './LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { BaseUsageExtractor } from '../billing/usage/base/BaseUsageExtractor.js';
import { BaseStreamProcessor } from '../billing/usage/base/BaseStreamProcessor.js';
import { GEMINI_PATHS } from './constants.js';
import { UsageInfo } from '../billing/pricing.js';

/**
 * Google Gemini Provider Implementation
 * Handles requests to Google Gemini API
 */
export class GeminiProvider extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Provider name
  readonly providerName = 'gemini';

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [
    GEMINI_PATHS.CHAT_COMPLETIONS,
    GEMINI_PATHS.STREAM_CHAT_COMPLETIONS
  ] as const;

  constructor() {
    super();
    this.baseURL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  }

  /**
   * Prepare request data for Google Gemini API
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    return { ...data };
  }

  /**
   * Forward request to Google Gemini API
   */
  async forwardRequest(
    apiKey: string | null,
    path: string,
    method: string = 'POST',
    data?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key as query parameter
      let fullUrl = `${this.baseURL}${path}`;
      if (apiKey) {
        fullUrl = `${fullUrl}?key=${apiKey}`;
      }

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(data, isStream);

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: finalData,
        headers,
        responseType: isStream ? 'stream' : 'json',
      });
      console.log(`✅ Received response from Google Gemini: ${JSON.stringify(response.data)}`);
      return response;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);
      return {
        error: errorInfo.message,
        status: errorInfo.statusCode,
        details: errorInfo.details,
      };
    }
  }

  /**
   * Parse Google Gemini response
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;
      if (!data || typeof data !== 'object') {
        return data;
      }

      return {
        ...data,
        provider:'gemini'
        };
      } catch (error) {
      console.error('[GeminiProvider] Error parsing response:', error);
      // Return original data on error (similar to OpenAI)
      return response.data;
    }
  }

  /**
   * Create Gemini-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new GeminiUsageExtractor();
  }

  /**
   * Create Gemini-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new GeminiStreamProcessor(model, initialCost);
  }

  /**
   * Get provider-specific test models for integration testing
   */
  getTestModels(): string[] {
    return ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
  }

  /**
   * Get default test options
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'gemini-1.5-flash',
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        { role: 'user', content: 'Hello, who are you?' }
      ]
    };
  }

  /**
   * Create a test request for the given endpoint
   */
  createTestRequest(endpoint: string, options?: Record<string, any>): any {
    const defaultOptions = this.getDefaultTestOptions();
    const mergedOptions = { ...defaultOptions, ...options };

    // 处理特殊的端点格式，如models/{model}:generateContent
    let formattedEndpoint = endpoint;
    if (formattedEndpoint.includes('{model}') && mergedOptions.model) {
      formattedEndpoint = formattedEndpoint.replace('{model}', mergedOptions.model);
    }

    return {
      ...mergedOptions,
      endpoint: formattedEndpoint
    };
  }
}

// GeminiUsageExtractor和GeminiStreamProcessor类保持不变
/**
 * Google Gemini usage extractor
 */
class GeminiUsageExtractor extends BaseUsageExtractor {
  constructor() {
    super('gemini');
  }

  extractFromResponseBody(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      // Check if this is a parsed Gemini response with usage info
      if (responseBody.usage && typeof responseBody.usage === 'object') {
        const usage = responseBody.usage;
        return {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        };
      }

      // Check if this is a raw Gemini response
      if (responseBody.usage_metadata && typeof responseBody.usage_metadata === 'object') {
        const usageMeta = responseBody.usage_metadata;
        return {
          promptTokens: usageMeta.promptTokenCount || 0,
          completionTokens: usageMeta.candidatesTokenCount || 0,
          totalTokens: usageMeta.totalTokenCount || 0
        };
      }

      return null;
    } catch (error) {
      console.error('[GeminiUsageExtractor] Error extracting usage from response body:', error);
      return null;
    }
  }

  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      // Gemini streaming format parsing logic
      // This is a simplified implementation
      if (chunkText.includes('usage_metadata')) {
        const match = chunkText.match(/"usage_metadata":\s*({[^}]+})/);
        if (match && match[1]) {
          try {
            const usageMeta = JSON.parse(match[1]);
            if (usageMeta.totalTokenCount) {
              return {
                usage: {
                  promptTokens: usageMeta.promptTokenCount || 0,
                  completionTokens: usageMeta.candidatesTokenCount || 0,
                  totalTokens: usageMeta.totalTokenCount || 0
                }
              };
            }
          } catch (e) {
            console.error('[GeminiUsageExtractor] Error parsing streaming chunk:', e);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('[GeminiUsageExtractor] Error extracting usage from stream chunk:', error);
      return null;
    }
  }
}

/**
 * Google Gemini stream processor
 */
class GeminiStreamProcessor extends BaseStreamProcessor {
  constructor(model: string, initialCost?: number) {
    super(model, initialCost);
  }

  processChunk(chunk: string): void {
    try {
      super.processChunk(chunk);
      // Additional Gemini-specific streaming processing can be added here
    } catch (error) {
      console.error('[GeminiStreamProcessor] Error processing chunk:', error);
    }
  }
}
