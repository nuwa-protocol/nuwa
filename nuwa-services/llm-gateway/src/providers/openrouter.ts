import 'dotenv/config';
import axios, { AxiosResponse } from 'axios';
import { BaseLLMProvider, ProviderErrorDetails } from '../providers/BaseLLMProvider.js';
import { TestableLLMProvider } from '../providers/LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { OpenRouterUsageExtractor } from '../billing/usage/providers/OpenRouterUsageExtractor.js';
import { OpenRouterStreamProcessor } from '../billing/usage/providers/OpenRouterStreamProcessor.js';
import { OPENROUTER_PATHS } from '../providers/constants.js';

// Native streamToString tool function, placed outside the class
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

interface OpenRouterErrorInfo {
  message: string;
  statusCode: number;
  details?: ProviderErrorDetails;
}

// Typed error return for forwardRequest
interface UpstreamErrorResponse {
  error: string;
  status?: number;
  details?: ProviderErrorDetails;
}

class OpenRouterService extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Provider name
  readonly providerName = 'openrouter';

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [OPENROUTER_PATHS.CHAT_COMPLETIONS] as const;

  constructor() {
    super();
    this.baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai';
  }

  // Extract error information from axios error (handles Buffer/Stream/object) and log structured details
  protected async extractErrorInfo(error: any): Promise<OpenRouterErrorInfo> {
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;
    let details: ProviderErrorDetails = {};

    if (error.response) {
      statusCode = error.response.status;
      const statusText = error.response.statusText;
      const headers = error.response.headers || {};

      // Extract request ID using unified method from base class
      const requestId = this.extractRequestIdFromHeaders(headers);

      if (error.response.data) {
        let data = error.response.data;
        let rawBody: string | undefined;

        // Use base class methods for Buffer and Stream handling
        const normalizedData = await this.normalizeErrorData(data);

        if (normalizedData && typeof normalizedData === 'object') {
          // Extract error information from normalized data
          const errorObj = normalizedData.error || normalizedData;
          errorMessage =
            errorObj.message ||
            normalizedData.message ||
            `Error response with status ${statusCode}`;

          details = {
            code: errorObj.code || normalizedData.code,
            type: errorObj.type || normalizedData.type,
            statusText,
            requestId,
            headers: this.extractRelevantHeaders(headers),
            rawError: normalizedData,
          };
        } else if (typeof normalizedData === 'string') {
          errorMessage = normalizedData;
          rawBody = normalizedData;
          details = {
            statusText,
            requestId,
            rawBody,
            rawError: normalizedData,
          };
        } else {
          errorMessage = `HTTP ${statusCode}: ${statusText}`;
          details = {
            statusText,
            requestId,
          };
        }
      } else {
        errorMessage = `HTTP ${statusCode}: ${statusText}`;
        details = {
          statusText,
          requestId,
        };
      }
    } else if (error.request) {
      errorMessage = 'No response received from OpenRouter';
      statusCode = 503;
      details = {
        type: 'network_error',
      };
    } else {
      errorMessage = error.message || 'Unknown error occurred';
      details = {
        type: 'request_setup_error',
      };
    }

    const errorInfo = { message: errorMessage, statusCode, details };

    // Use base class logging with OpenRouter-specific provider name
    this.logErrorInfo(errorInfo, error, 'openrouter');

    return errorInfo;
  }

  /**
   * Prepare request data for OpenRouter API
   * Injects usage.include=true for usage tracking
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // For OpenRouter, always inject usage tracking
    return {
      ...data,
      usage: {
        include: true,
        ...(data.usage || {}),
      },
    };
  }

  // Generic forwarding request to OpenRouter - supports any path
  async forwardRequest(
    apiKey: string | null,
    apiPath: string,
    method: string = 'POST',
    requestData?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | UpstreamErrorResponse | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add Authorization header only if API key is provided
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        console.warn(`No API key provided for OpenRouter request`);
      }

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(requestData, isStream);

      // New logic: Use baseURL + apiPath directly (no hardcoded /api/v1 prefix)
      const fullUrl = `${this.baseURL}${apiPath}`;

      const response = await axios({
        method: method.toLowerCase() as any,
        url: fullUrl,
        data: finalData,
        headers,
        responseType: isStream ? 'stream' : 'json',
      });

      try {
        const u = (response.headers || {})['x-usage'];
        if (u) console.log('[openrouter] x-usage header:', u);
      } catch {}

      return response;
    } catch (error: any) {
      const errorInfo = await this.extractErrorInfo(error);

      // Enhanced error logging for authentication failures
      if (errorInfo.statusCode === 401) {
        console.error(`OpenRouter authentication failed: ${errorInfo.message}`);
        console.error(`URL: ${this.baseURL}${apiPath}`);
      } else {
        console.error(`OpenRouter request failed (${errorInfo.statusCode}): ${errorInfo.message}`);
      }

      // Extract error information to return to client (attach details for higher-level logging)
      return { error: errorInfo.message, status: errorInfo.statusCode, details: errorInfo.details };
    }
  }

  // Pipe stream response to target stream
  pipeStreamResponse(
    response: AxiosResponse,
    targetStream: NodeJS.WritableStream,
    onEnd?: () => void,
    onError?: (error: Error) => void
  ): void {
    // Use default pipe settings, let Node.js automatically manage stream end
    const sourceStream = response.data;

    // Set error handling
    sourceStream.on('error', (error: Error) => {
      console.error('Source stream error:', error);
      onError?.(error);
    });

    targetStream.on('error', (error: Error) => {
      console.error('Target stream error:', error);
      onError?.(error);
    });

    // Use pipe and call callback on completion
    sourceStream.pipe(targetStream);

    // Listen to source stream end event
    sourceStream.on('end', () => {
      console.log('Source stream ended');
      onEnd?.();
    });

    // Listen to pipe end event
    sourceStream.on('close', () => {
      console.log('Source stream closed');
    });
  }

  /**
   * Extract USD cost from OpenRouter response
   * OpenRouter provides native USD cost in usage.cost or x-usage header
   *
   * NOTE: For stream responses, cost is NOT available at request initiation time.
   * Stream cost should be extracted from the final SSE chunks during stream processing.
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    try {
      const data = response.data;

      // Check if this is a stream response (data has pipe method)
      if (data && typeof data === 'object' && typeof data.pipe === 'function') {
        // For stream responses, cost is not available at this stage
        // It will be extracted later from SSE chunks by UsagePolicy.extractUsageFromStreamChunk
        return undefined;
      }

      // For non-stream responses, try to get cost from response body first
      if (data && typeof data === 'object' && data.usage && typeof data.usage.cost === 'number') {
        return data.usage.cost;
      }

      // Fallback to x-usage header for non-stream responses
      const headers = response.headers || {};
      const usageHeader = headers['x-usage'] || headers['X-Usage'];
      if (typeof usageHeader === 'string' && usageHeader.length > 0) {
        try {
          const parsed = JSON.parse(usageHeader);
          const cost = parsed?.total_cost ?? parsed?.total_cost_usd ?? parsed?.cost ?? parsed?.usd;
          if (cost != null) {
            const n = Number(cost);
            if (Number.isFinite(n)) return n;
          }
        } catch {
          // Try regex fallback
          const m =
            usageHeader.match(/total[_-]?cost[_usd]*=([0-9.]+)/i) ||
            usageHeader.match(/cost=([0-9.]+)/i);
          if (m && m[1]) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) return n;
          }
        }
      }
    } catch (error) {
      console.error('Error extracting USD cost from OpenRouter response:', error);
    }
    return undefined;
  }

  // Parse non-stream response
  parseResponse(response: AxiosResponse): any {
    try {
      const data: any = response.data;
      // Try to augment usage.cost (USD) from provider headers when not present in body
      const headers = (response.headers || {}) as Record<string, string>;

      const usage =
        data && typeof data === 'object' && data.usage ? { ...data.usage } : ({} as any);

      if (usage.cost == null) {
        // Heuristics for OpenRouter usage header
        // Common: 'x-usage' header containing JSON: { total_cost: "0.000001234", ... }
        const usageHeader = (headers['x-usage'] as any) || (headers['X-Usage'] as any);
        let parsedCost: number | undefined;
        if (typeof usageHeader === 'string' && usageHeader.length > 0) {
          try {
            const parsed = JSON.parse(usageHeader);
            const raw = parsed?.total_cost ?? parsed?.total_cost_usd ?? parsed?.cost ?? parsed?.usd;
            if (raw != null) {
              const n = Number(raw);
              if (Number.isFinite(n)) parsedCost = n;
            }
          } catch {
            // Fallback: try to extract number from a simple "key=value" string format
            const m =
              usageHeader.match(/total[_-]?cost[_usd]*=([0-9.]+)/i) ||
              usageHeader.match(/cost=([0-9.]+)/i);
            if (m && m[1]) {
              const n = Number(m[1]);
              if (Number.isFinite(n)) parsedCost = n;
            }
          }
        }

        if (parsedCost != null) {
          usage.cost = parsedCost;
        }
      }

      if (Object.keys(usage).length > 0) {
        return { ...data, usage };
      }
      return data;
    } catch (error) {
      console.error('Error parsing OpenRouter response:', error);
      return null;
    }
  }

  /**
   * Create OpenRouter-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new OpenRouterUsageExtractor();
  }

  /**
   * Create OpenRouter-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new OpenRouterStreamProcessor(model, initialCost);
  }

  /**
   * Get test models for OpenRouter provider
   * Implementation of TestableLLMProvider interface
   */
  getTestModels(): string[] {
    return [
      'openai/gpt-3.5-turbo',
      'openai/gpt-4',
      'anthropic/claude-3-haiku',
      'meta-llama/llama-2-70b-chat',
    ];
  }

  /**
   * Get default test options
   * Implementation of TestableLLMProvider interface
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'openai/gpt-3.5-turbo',
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

    if (endpoint === OPENROUTER_PATHS.CHAT_COMPLETIONS) {
      // Extract normalized options and map to API parameter names
      const { maxTokens, message, messages, ...rest } = options;

      return {
        model: options.model || defaults.model,
        messages: messages || [{ role: 'user', content: message || defaults.message }],
        max_tokens: maxTokens || defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
        stream: options.stream || false,
        ...rest, // Include any additional options
      };
    }

    throw new Error(`Unknown endpoint for OpenRouter service: ${endpoint}`);
  }
}

export default OpenRouterService;
