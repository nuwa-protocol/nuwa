import { AxiosResponse } from 'axios';
import { LLMProvider, ExecuteResponse, ExecuteStreamResponse } from './LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { UsageInfo, PricingResult } from '../billing/pricing.js';
import { CostCalculator } from '../billing/usage/CostCalculator.js';

/**
 * Standardized error details interface for all providers
 */
export interface ProviderErrorDetails {
  // Core error information
  code?: string; // Error code (e.g., 'invalid_api_key', 'rate_limit_exceeded')
  type?: string; // Error type (e.g., 'authentication_error', 'invalid_request_error')

  // HTTP details
  statusText?: string; // HTTP status text

  // Request identification
  requestId?: string; // Provider request ID for debugging

  // Additional context
  headers?: Record<string, any>; // Relevant headers
  param?: string; // Parameter that caused the error (OpenAI style)
  rawBody?: string; // Raw response body (if applicable)

  // Provider-specific raw error
  rawError?: any; // Original error object for detailed debugging
}

/**
 * Standardized error information interface for all providers
 */
export interface ProviderErrorInfo {
  message: string;
  statusCode: number;
  details?: ProviderErrorDetails;
}

/**
 * Base abstract class for LLM providers
 * Implements common high-level request methods that handle the complete request-response-usage cycle
 */
export abstract class BaseLLMProvider implements LLMProvider {
  /**
   * Provider name identifier (e.g., 'openai', 'claude', 'openrouter')
   * Must be implemented by each provider
   */
  abstract readonly providerName: string;

  /**
   * Paths supported by this provider
   * Must be implemented by each provider
   */
  abstract readonly SUPPORTED_PATHS: readonly string[];

  /**
   * Forward a request to the provider
   * Must be implemented by each provider
   */
  abstract forwardRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any,
    isStream?: boolean
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null>;

  /**
   * Parse non-streaming response and extract usage information
   * Must be implemented by each provider
   */
  abstract parseResponse(response: AxiosResponse): any;

  /**
   * Extract USD cost from provider response (optional)
   * Can be overridden by providers that support native USD cost
   */
  extractProviderUsageUsd?(response: AxiosResponse): number | undefined;

  /**
   * Prepare request data for this provider (optional)
   * Can be overridden by providers that need custom request preparation
   */
  prepareRequestData?(data: any, isStream: boolean): any;

  /**
   * Create a usage extractor for this provider (optional)
   * Can be overridden by providers that have custom usage extraction logic
   */
  createUsageExtractor?(): UsageExtractor;

  /**
   * Create a stream processor for this provider (optional)
   * Can be overridden by providers that have custom stream processing logic
   */
  createStreamProcessor?(model: string, initialCost?: number): StreamProcessor;

  /**
   * Extract request ID from response headers
   * Supports multiple provider-specific header names
   * @param headers Response headers object
   * @returns Request ID string or undefined if not found
   */
  protected extractRequestIdFromHeaders(headers: any): string | undefined {
    if (!headers) return undefined;

    // Check all known request ID header names
    // Order matters: prefer standard names first
    return (
      headers['x-request-id'] ||
      headers['x-openai-request-id'] ||
      headers['openrouter-request-id'] ||
      headers['request-id'] ||
      headers['anthropic-request-id']
    );
  }

  /**
   * Check if data is a readable stream (Node.js stream)
   * Unified stream detection to avoid inconsistencies
   */
  protected isReadableStream(data: any): boolean {
    // Most reliable check: presence of 'pipe' method (present in all readable streams)
    // Combined with 'on' method for event listening
    return !!(
      data &&
      typeof data === 'object' &&
      typeof data.pipe === 'function' &&
      typeof data.on === 'function'
    );
  }

  /**
   * Normalize error response data (handle Stream, Buffer, Object, String)
   * Unified data normalization to ensure consistent error extraction
   */
  protected async normalizeErrorData(data: any): Promise<any> {
    // Handle Buffer
    if (Buffer.isBuffer(data)) {
      try {
        const text = data.toString('utf-8');
        try {
          return JSON.parse(text);
        } catch {
          return text; // Return as string if not JSON
        }
      } catch (error) {
        console.error('Failed to parse Buffer data:', error);
        return null;
      }
    }

    // Handle Stream
    if (this.isReadableStream(data)) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of data) {
          chunks.push(Buffer.from(chunk));
        }
        const text = Buffer.concat(chunks).toString('utf-8');
        try {
          return JSON.parse(text);
        } catch {
          return text; // Return as string if not JSON
        }
      } catch (error) {
        console.error('Failed to read stream data:', error);
        return null;
      }
    }

    // Handle String (try to parse as JSON)
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        // If failed to parse as JSON, return the original string
        return data;
      }
    }

    // Already normalized (Object)
    return data;
  }

  /**
   * Log structured error information for debugging and monitoring
   */
  protected logErrorInfo(errorInfo: ProviderErrorInfo, error: any, providerName?: string): void {
    const provider =
      providerName ||
      this.constructor.name.replace('Provider', '').replace('Service', '').toLowerCase();

    // Log basic error information
    console.error(`❌ Error forwarding request to ${provider}: ${errorInfo.message}`);

    // Log detailed error information if available
    if (errorInfo.details) {
      console.error(`📋 ${provider} error details:`, {
        status: errorInfo.statusCode,
        message: errorInfo.message,
        code: errorInfo.details.code,
        type: errorInfo.details.type,
        param: errorInfo.details.param,
        requestId: errorInfo.details.requestId,
      });
    }

    // Log request information for debugging (if available from axios error)
    if (error?.config) {
      console.error(`📤 Request info:`, {
        method: error.config.method?.toUpperCase(),
        url: error.config.url,
        hasData: !!error.config.data,
        dataKeys: error.config.data ? Object.keys(error.config.data) : [],
      });
    }
  }

  /**
   * Extract error information from axios error
   * Provides base implementation that can be used or overridden by providers
   */
  protected async extractErrorInfo(error: any): Promise<ProviderErrorInfo> {
    let message = 'Unknown error occurred';
    let statusCode = 500;
    let details: ProviderErrorDetails = {};

    if (error.response) {
      // HTTP error response from provider
      statusCode = error.response.status;
      const statusText = error.response.statusText;
      const headers = error.response.headers;

      // Extract request ID using unified method
      const requestId = this.extractRequestIdFromHeaders(headers);

      // Normalize data (handle Stream, Buffer, Object, String)
      let data = await this.normalizeErrorData(error.response.data);

      // Extract error information from normalized data
      if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
        // Support multiple error formats:
        // 1. Claude format: { type: "error", error: { type, message }, request_id }
        // 2. OpenAI format: { error: { message, code, type } }
        // 3. Direct format: { message, code, type }

        let errorObj = data.error || data;
        let errorMessage = errorObj.message || `Error response with status ${statusCode}`;
        let errorCode = errorObj.code;
        let errorType = errorObj.type;

        // Handle Claude's nested error structure
        if (data.type === 'error' && data.error && typeof data.error === 'object') {
          // Claude format: { type: "error", error: { type, message }, request_id }
          errorMessage = data.error.message || errorMessage;
          errorType = data.error.type || errorType;
          errorCode = data.error.code || errorCode;

          // Also extract request_id from Claude response
          if (data.request_id && !requestId) {
            details.requestId = data.request_id;
          }
        }

        message = errorMessage;

        details = {
          code: errorCode,
          type: errorType,
          param: errorObj.param,
          statusText,
          requestId: details.requestId || requestId,
          headers: this.extractRelevantHeaders(headers),
          rawError: data, // Store the full normalized response for transparency
        };
      } else if (typeof data === 'string') {
        message = data;
        details = {
          statusText,
          requestId,
          rawBody: data,
          rawError: data,
        };
      } else {
        message = `HTTP ${statusCode}: ${statusText}`;
        details = {
          statusText,
          requestId,
        };
      }
    } else if (error.request) {
      // Network error - no response received
      message = 'Network error - Unable to reach provider';
      statusCode = 503;
      details = {
        type: 'network_error',
      };
    } else {
      // Other error (request setup, etc.)
      message = error.message || 'Unknown error occurred';
      details = {
        type: 'request_setup_error',
      };
    }

    const errorInfo = { message, statusCode, details };

    // Automatically log error information
    this.logErrorInfo(errorInfo, error);

    return errorInfo;
  }

  /**
   * Extract relevant headers for debugging
   */
  protected extractRelevantHeaders(headers: any): Record<string, any> | undefined {
    if (!headers) return undefined;

    const relevant: Record<string, any> = {};
    const headerKeys = [
      'x-request-id',
      'x-openai-request-id',
      'openrouter-request-id',
      'request-id',
      'anthropic-request-id',
      'x-usage',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'cf-ray',
      'openai-organization',
      'openai-processing-ms',
    ];

    for (const key of headerKeys) {
      if (headers[key]) {
        relevant[key] = headers[key];
      }
    }

    return Object.keys(relevant).length > 0 ? relevant : undefined;
  }

  /**
   * High-level request method for non-streaming requests
   * Handles forward request, parsing, and usage extraction
   */
  async executeRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any
  ): Promise<ExecuteResponse> {
    try {
      let finalRequestData = data;
      if (finalRequestData && this.prepareRequestData) {
        finalRequestData = this.prepareRequestData(finalRequestData, false);
      }

      // Forward the request
      const response = await this.forwardRequest(apiKey, path, method, finalRequestData, false);

      // Handle null response
      if (!response) {
        return {
          success: false,
          statusCode: 502,
          error: 'No response received from provider',
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          error: response.error,
          details: response.details,
          upstreamRequestId: response.details?.requestId,
          errorCode: response.details?.code,
          errorType: response.details?.type,
        };
      }

      // Parse the response
      const responseData = this.parseResponse(response);

      // Extract usage and calculate cost
      const model = finalRequestData?.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd
        ? this.extractProviderUsageUsd(response)
        : undefined;

      let usage: UsageInfo | undefined;
      let cost: PricingResult | undefined;

      // Get provider-specific usage extractor
      if (this.createUsageExtractor) {
        const extractor = this.createUsageExtractor();
        const extractedUsage = extractor.extractFromResponseBody(responseData);
        usage = extractedUsage || undefined;

        if (usage) {
          const calculatedCost = CostCalculator.calculateProviderRequestCost(
            this.providerName,
            model,
            providerCostUsd,
            usage
          );
          cost = calculatedCost || undefined;
          console.log(`[${this.constructor.name}] Extracted usage for non-stream response`);
        }
      }

      return {
        success: true,
        statusCode: response.status,
        response: responseData,
        usage,
        cost,
        rawResponse: response,
        upstreamRequestId: this.extractRequestIdFromHeaders(response.headers),
      };
    } catch (error) {
      console.error(`[${this.constructor.name}] Error in executeRequest:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      };
    }
  }

  /**
   * High-level request method for streaming requests
   * Automatically forwards stream to destination and returns final statistics
   */
  async executeStreamRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data: any,
    destination: NodeJS.WritableStream
  ): Promise<ExecuteStreamResponse> {
    try {
      // Prepare request data using provider-specific logic
      const finalRequestData = this.prepareRequestData ? this.prepareRequestData(data, true) : data;

      // Forward the streaming request
      const response = await this.forwardRequest(apiKey, path, method, finalRequestData, true);

      // Handle null response
      if (!response) {
        return {
          success: false,
          statusCode: 502,
          totalBytes: 0,
          error: 'No response received from provider',
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          totalBytes: 0,
          error: response.error,
          details: response.details,
          upstreamRequestId: response.details?.requestId,
          errorCode: response.details?.code,
          errorType: response.details?.type,
        };
      }

      // Create stream processor if available
      const model = finalRequestData.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd
        ? this.extractProviderUsageUsd(response)
        : undefined;
      const processor = this.createStreamProcessor
        ? this.createStreamProcessor(model, providerCostUsd)
        : undefined;

      if (processor) {
        console.log(`[${this.constructor.name}] Created stream processor for model: ${model}`);
      }

      // Automatically forward stream to destination and wait for completion
      return new Promise((resolve, reject) => {
        let totalBytes = 0;

        response.data.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;

          // Automatically call processor if available
          if (processor) {
            processor.processChunk(chunk.toString());
          }

          // Forward to destination stream
          destination.write(chunk);
        });

        response.data.on('end', () => {
          const finalUsage = processor?.getFinalUsage();
          const finalCost = processor?.getFinalCost();

          // ⭐️ CRITICAL: Set res.locals BEFORE destination.end() for PaymentKit and accessLog
          // PaymentKit's res.on('finish') handler needs res.locals.usage to be set
          if ('locals' in destination) {
            (destination as any).locals = (destination as any).locals || {};

            // Set usage info for access log
            if (finalUsage) {
              (destination as any).locals.usageInfo = finalUsage;
            }

            // Set cost result for access log
            if (finalCost) {
              (destination as any).locals.costResult = finalCost;

              // ⭐️ CRITICAL: Set billing usage for PaymentKit
              const picoUsd = Math.round(Number(finalCost.costUsd || 0) * 1e12);
              (destination as any).locals.usage = picoUsd;
              console.log(
                `[${this.constructor.name}] Set billing usage: ${picoUsd} pico USD ($${finalCost.costUsd})`
              );
            }

            // ⭐️ Update upstream meta if it exists (set by RouteHandler)
            // This ensures accessLog can capture complete upstream information
            if ((destination as any).locals.upstream) {
              const upstreamRequestId = this.extractRequestIdFromHeaders(response.headers);
              if (upstreamRequestId) {
                (destination as any).locals.upstream.upstream_request_id = upstreamRequestId;
              }
              if (finalCost) {
                (destination as any).locals.upstream.upstream_cost_usd = finalCost.costUsd;
              }
              (destination as any).locals.upstream.upstream_bytes = totalBytes;
              (destination as any).locals.upstream.upstream_status_code = response.status;
            }
          }

          // End the destination stream (this triggers res.on('finish') which PaymentKit and accessLog listen to)
          destination.end();

          resolve({
            success: true,
            statusCode: response.status,
            totalBytes,
            usage: finalUsage || undefined,
            cost: finalCost || undefined,
            rawResponse: response,
            upstreamRequestId: this.extractRequestIdFromHeaders(response.headers),
          });
        });

        response.data.on('error', (error: Error) => {
          console.error(`[${this.constructor.name}] Stream error:`, error);
          try {
            destination.end();
          } catch (e) {
            // Ignore errors when ending the stream (it might already be closed)
          }
          reject(error);
        });
      });
    } catch (error) {
      console.error(`[${this.constructor.name}] Error in executeStreamRequest:`, error);
      return {
        success: false,
        statusCode: 502,
        totalBytes: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error,
        upstreamRequestId: (error as any)?.response?.headers
          ? this.extractRequestIdFromHeaders((error as any).response.headers)
          : undefined,
      };
    }
  }
}
