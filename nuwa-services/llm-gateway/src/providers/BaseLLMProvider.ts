import { AxiosResponse } from "axios";
import { LLMProvider, ExecuteResponse, ExecuteStreamResponse } from "./LLMProvider.js";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";
import { UsageInfo, PricingResult } from "../billing/pricing.js";
import { CostCalculator } from "../billing/usage/CostCalculator.js";

/**
 * Standardized error details interface for all providers
 */
export interface ProviderErrorDetails {
  // Core error information
  code?: string;           // Error code (e.g., 'invalid_api_key', 'rate_limit_exceeded')
  type?: string;           // Error type (e.g., 'authentication_error', 'invalid_request_error')
  
  // HTTP details
  statusText?: string;     // HTTP status text
  
  // Request identification
  requestId?: string;      // Provider request ID for debugging
  
  // Additional context
  headers?: Record<string, any>;  // Relevant headers
  param?: string;          // Parameter that caused the error (OpenAI style)
  rawBody?: string;        // Raw response body (if applicable)
  
  // Provider-specific raw error
  rawError?: any;          // Original error object for detailed debugging
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
    
    // Already normalized (Object or String)
    return data;
  }

  /**
   * Log structured error information for debugging and monitoring
   */
  protected logErrorInfo(errorInfo: ProviderErrorInfo, error: any, providerName?: string): void {
    const provider = providerName || this.constructor.name.replace('Provider', '').replace('Service', '').toLowerCase();
    
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
    let message = "Unknown error occurred";
    let statusCode = 500;
    let details: ProviderErrorDetails = {};

    if (error.response) {
      // HTTP error response from provider
      statusCode = error.response.status;
      const statusText = error.response.statusText;
      const headers = error.response.headers;
      
      // Extract request ID from common header names
      const requestId = headers?.['x-request-id'] 
        || headers?.['x-openai-request-id']
        || headers?.['openrouter-request-id']
        || headers?.['request-id'];
      
      // Normalize data (handle Stream, Buffer, Object, String)
      let data = await this.normalizeErrorData(error.response.data);
      
      // Extract error information from normalized data
      if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
        // Support common error formats: { error: { message, code, type } } or { message, code, type }
        const errorObj = data.error || data;
        message = errorObj.message || `Error response with status ${statusCode}`;
        
        details = {
          code: errorObj.code,
          type: errorObj.type,
          param: errorObj.param,
          statusText,
          requestId,
          headers: this.extractRelevantHeaders(headers),
          rawError: data // Store the full normalized response for transparency
        };
      } else if (typeof data === 'string') {
        message = data;
        details = {
          statusText,
          requestId,
          rawBody: data,
          rawError: data
        };
      } else {
        message = `HTTP ${statusCode}: ${statusText}`;
        details = {
          statusText,
          requestId
        };
      }
    } else if (error.request) {
      // Network error - no response received
      message = "Network error - Unable to reach provider";
      statusCode = 503;
      details = {
        type: 'network_error'
      };
    } else {
      // Other error (request setup, etc.)
      message = error.message || "Unknown error occurred";
      details = {
        type: 'request_setup_error'
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
      'x-usage',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'cf-ray',
      'openai-organization',
      'openai-processing-ms'
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
      // Prepare request data using provider-specific logic
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
          error: 'No response received from provider'
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          error: response.error,
          details: response.details
        };
      }

      // Parse the response
      const responseData = this.parseResponse(response);

      // Extract usage and calculate cost
      const model = finalRequestData?.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd ? this.extractProviderUsageUsd(response) : undefined;
      
      let usage: UsageInfo | undefined;
      let cost: PricingResult | undefined;

      // Get provider-specific usage extractor
      if (this.createUsageExtractor) {
        const extractor = this.createUsageExtractor();
        const extractedUsage = extractor.extractFromResponseBody(responseData);
        usage = extractedUsage || undefined;
        
        if (usage) {
          const calculatedCost = CostCalculator.calculateRequestCost(model, providerCostUsd, usage);
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
        rawResponse: response
      };

    } catch (error) {
      console.error(`[${this.constructor.name}] Error in executeRequest:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
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
      const finalRequestData = this.prepareRequestData 
        ? this.prepareRequestData(data, true) 
        : data;

      // Forward the streaming request
      const response = await this.forwardRequest(apiKey, path, method, finalRequestData, true);

      // Handle null response
      if (!response) {
        return {
          success: false,
          statusCode: 502,
          totalBytes: 0,
          error: 'No response received from provider'
        };
      }

      // Handle error response
      if ('error' in response) {
        return {
          success: false,
          statusCode: response.status || 500,
          totalBytes: 0,
          error: response.error,
          details: response.details
        };
      }

      // Create stream processor if available
      const model = finalRequestData.model || 'unknown';
      const providerCostUsd = this.extractProviderUsageUsd ? this.extractProviderUsageUsd(response) : undefined;
      const processor = this.createStreamProcessor ? this.createStreamProcessor(model, providerCostUsd) : undefined;

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
          
          // End the destination stream
          destination.end();
          
          resolve({
            success: true,
            statusCode: response.status,
            totalBytes,
            usage: finalUsage || undefined,
            cost: finalCost || undefined,
            rawResponse: response
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
        details: error
      };
    }
  }
}
