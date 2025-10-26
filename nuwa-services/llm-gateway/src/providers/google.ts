import axios, { AxiosResponse } from 'axios';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { TestableLLMProvider } from './LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { GoogleUsageExtractor } from '../billing/usage/providers/GoogleUsageExtractor.js';
import { GoogleStreamProcessor } from '../billing/usage/providers/GoogleStreamProcessor.js';
import { GOOGLE_PATHS } from './constants.js';

/**
 * Google Gemini Provider Implementation
 * Handles Google Gemini API requests with proper authentication and usage tracking
 */
export class GoogleProvider extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Provider name
  readonly providerName = 'google';

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [
    GOOGLE_PATHS.GENERATE_CONTENT,
    GOOGLE_PATHS.STREAM_GENERATE_CONTENT,
    GOOGLE_PATHS.MODELS,
  ] as const;

  constructor() {
    super();
    this.baseURL =
      process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Prepare request data for Google Gemini API
   * Transforms OpenAI-style messages to Google's contents format
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Clone data to avoid mutating the original
    const preparedData = { ...data };

    // Transform OpenAI-style messages to Google contents format if present
    if (preparedData.messages && Array.isArray(preparedData.messages)) {
      preparedData.contents = this.transformMessagesToContents(preparedData.messages);
      delete preparedData.messages;
    }

    // Map common parameters to Google's format
    if (preparedData.max_tokens !== undefined) {
      if (!preparedData.generationConfig) {
        preparedData.generationConfig = {};
      }
      preparedData.generationConfig.maxOutputTokens = preparedData.max_tokens;
      delete preparedData.max_tokens;
    }

    if (preparedData.temperature !== undefined) {
      if (!preparedData.generationConfig) {
        preparedData.generationConfig = {};
      }
      preparedData.generationConfig.temperature = preparedData.temperature;
      delete preparedData.temperature;
    }

    if (preparedData.top_p !== undefined) {
      if (!preparedData.generationConfig) {
        preparedData.generationConfig = {};
      }
      preparedData.generationConfig.topP = preparedData.top_p;
      delete preparedData.top_p;
    }

    // Remove model from request body - it's in the URL path
    delete preparedData.model;
    delete preparedData.stream;

    return preparedData;
  }

  /**
   * Transform OpenAI-style messages to Google contents format
   */
  private transformMessagesToContents(messages: any[]): any[] {
    const contents: any[] = [];
    let systemInstruction: string | null = null;

    for (const message of messages) {
      const role = message.role;
      const content = message.content;

      // Handle system messages separately
      if (role === 'system') {
        systemInstruction = typeof content === 'string' ? content : JSON.stringify(content);
        continue;
      }

      // Map roles: user -> user, assistant -> model
      const googleRole = role === 'assistant' ? 'model' : 'user';

      // Transform content to parts array
      let parts: any[];
      if (typeof content === 'string') {
        parts = [{ text: content }];
      } else if (Array.isArray(content)) {
        // Handle multimodal content
        parts = content.map((item: any) => {
          if (item.type === 'text') {
            return { text: item.text };
          } else if (item.type === 'image_url') {
            // Transform image URL to inline data
            const imageUrl = item.image_url?.url || item.image_url;
            if (imageUrl.startsWith('data:')) {
              // Extract mime type and data from data URL
              const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                return {
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                };
              }
            }
            // If not a data URL, return as text (Google may not support external URLs)
            return { text: `[Image: ${imageUrl}]` };
          }
          return { text: JSON.stringify(item) };
        });
      } else {
        parts = [{ text: JSON.stringify(content) }];
      }

      contents.push({
        role: googleRole,
        parts,
      });
    }

    return contents;
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
      // API key is required for Google
      if (!apiKey) {
        return {
          error: 'API key is required for Google provider',
          status: 401,
        };
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(data, isStream);

      // Extract model from original data to build the URL
      const model = data?.model || 'gemini-pro';

      // Replace {model} placeholder in path
      let finalPath = path.replace('{model}', model);

      // For streaming, use the streaming endpoint
      if (isStream && path.includes('generateContent')) {
        finalPath = finalPath.replace(':generateContent', ':streamGenerateContent');
      }

      // Build full URL with API key as query parameter
      const fullUrl = `${this.baseURL}${finalPath}?key=${apiKey}`;

      console.log(`🔄 Forwarding ${method} request to Google: ${finalPath}`);

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: finalData,
        headers,
        responseType: isStream ? 'stream' : 'json',
      });

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
   * Parse Google response and extract relevant information
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;

      // Google API returns response in candidates array
      // Basic parsing - detailed usage extraction is handled by GoogleUsageExtractor
      return {
        ...data,
        provider: 'google',
      };
    } catch (error) {
      console.error('❌ Error parsing Google response:', error);
      return response.data;
    }
  }

  /**
   * Extract USD cost from Google response (if available)
   * Google doesn't typically provide cost in response, so return undefined
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    // Google API doesn't provide cost in response
    return undefined;
  }

  /**
   * Create Google-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new GoogleUsageExtractor();
  }

  /**
   * Create Google-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new GoogleStreamProcessor(model, initialCost);
  }

  /**
   * Get test models for Google provider
   * Implementation of TestableLLMProvider interface
   */
  getTestModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-pro-vision',
    ];
  }

  /**
   * Get default test options
   * Implementation of TestableLLMProvider interface
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'gemini-2.0-flash-exp',
      message: 'Hello! Please respond with a brief greeting.',
      maxTokens: 100,
      temperature: 0.7,
    };
  }

  /**
   * Create test request for the given endpoint
   * Implementation of TestableLLMProvider interface
   */
  createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
    const defaults = this.getDefaultTestOptions();

    if (
      endpoint === GOOGLE_PATHS.GENERATE_CONTENT ||
      endpoint === GOOGLE_PATHS.STREAM_GENERATE_CONTENT
    ) {
      // Extract normalized options
      const { maxTokens, message, messages, ...rest } = options;

      return {
        model: options.model || defaults.model,
        max_tokens: maxTokens || defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
        messages: messages || [{ role: 'user', content: message || defaults.message }],
        stream: options.stream || false,
        ...rest, // Include any additional options
      };
    }

    throw new Error(`Unknown endpoint for Google provider: ${endpoint}`);
  }
}

// Export singleton instance
export const googleProvider = new GoogleProvider();
