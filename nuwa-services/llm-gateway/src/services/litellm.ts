import axios, { AxiosResponse } from 'axios';
import { BaseLLMProvider } from '../providers/BaseLLMProvider.js';
import { TestableLLMProvider } from '../providers/LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { LiteLLMUsageExtractor } from '../billing/usage/providers/LiteLLMUsageExtractor.js';
import { LiteLLMStreamProcessor } from '../billing/usage/providers/LiteLLMStreamProcessor.js';
import { LITELLM_PATHS } from '../providers/constants.js';

/**
 * Minimal service adapter for proxying requests to a LiteLLM Proxy instance.
 * It mirrors the key methods used by `OpenRouterService` so the same routing
 * layer can operate on either backend.
 */
class LiteLLMService extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Provider name
  readonly providerName = 'litellm';

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [LITELLM_PATHS.CHAT_COMPLETIONS] as const;

  constructor() {
    super();
    // Base URL of the LiteLLM Proxy
    this.baseURL = process.env.LITELLM_BASE_URL || 'http://localhost:4000';
  }

  /**
   * Prepare request data for LiteLLM API
   * LiteLLM typically doesn't need special modifications, return as-is
   */
  prepareRequestData(data: any, isStream: boolean): any {
    // LiteLLM handles usage tracking automatically, no modifications needed
    return data;
  }

  /**
   * Forward an arbitrary request to LiteLLM.
   * Only POST/GET are expected in practice, but other verbs are accepted.
   */
  async forwardRequest(
    apiKey: string | null, // Can be null if provider doesn't require API key
    apiPath: string,
    method: string = 'POST',
    requestData?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add Authorization header only if API key is provided
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(requestData, isStream);

      const fullUrl = `${this.baseURL}${apiPath}`; // Note: apiPath already contains leading slash

      const response = await axios({
        method: method.toLowerCase(),
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
   * Extract the JSON payload for non-stream responses.
   */
  parseResponse(response: AxiosResponse): any {
    return response.data;
  }

  /**
   * Extract USD cost from LiteLLM response
   * LiteLLM may provide cost in x-litellm-response-cost header
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    try {
      const headers = response.headers || {};
      const costHeader = headers['x-litellm-response-cost'];
      if (typeof costHeader === 'string') {
        const cost = Number(costHeader);
        if (Number.isFinite(cost)) {
          return cost;
        }
      }
    } catch (error) {
      console.error('Error extracting USD cost from LiteLLM response:', error);
    }
    return undefined;
  }

  /* ------------------------------------------------------------------
   * Helper utils
   * ------------------------------------------------------------------ */

  /**
   * Create LiteLLM-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new LiteLLMUsageExtractor();
  }

  /**
   * Create LiteLLM-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new LiteLLMStreamProcessor(model, initialCost);
  }

  /**
   * Get test models for LiteLLM provider
   * Implementation of TestableLLMProvider interface
   */
  getTestModels(): string[] {
    return [
      'gpt-3.5-turbo',
      'gpt-4',
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'gemini-pro',
    ];
  }

  /**
   * Get default test options
   * Implementation of TestableLLMProvider interface
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'gpt-3.5-turbo',
      message: 'Hello, this is a test message.',
      maxTokens: 50,
      temperature: 0.7,
    };
  }

  /**
   * Create test request for the given endpoint
   * Implementation of TestableLLMProvider interface
   */
  createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
    const defaults = this.getDefaultTestOptions();

    if (endpoint === LITELLM_PATHS.CHAT_COMPLETIONS) {
      // Extract normalized options and map to API parameter names
      const { maxTokens, message, messages, ...rest } = options;

      return {
        model: options.model || defaults.model,
        messages: messages || [{ role: 'user', content: message || defaults.message }],
        max_tokens: maxTokens || defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
        stream: options.stream || false,
        ...rest, // Include any additional options (like user, metadata, tags)
      };
    }

    throw new Error(`Unknown endpoint for LiteLLM service: ${endpoint}`);
  }
}

export default LiteLLMService;
