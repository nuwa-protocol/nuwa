import axios, { AxiosResponse } from "axios";
import { LLMProvider } from "./LLMProvider.js";
import { validateToolConfig } from "../config/responseApiTools.js";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";
import { OpenAIUsageExtractor } from "../billing/usage/providers/OpenAIUsageExtractor.js";
import { OpenAIStreamProcessor } from "../billing/usage/providers/OpenAIStreamProcessor.js";

/**
 * OpenAI Provider Implementation
 * Handles native OpenAI API requests without cost calculation
 * Cost calculation is done by the gateway pricing system
 */
export class OpenAIProvider implements LLMProvider {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/";
  }

  /**
   * Prepare request data for OpenAI API
   * Supports both Chat Completions and Response API
   * Injects stream_options.include_usage for streaming requests
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Detect if this is a Response API request by checking for Response API specific fields
    const isResponseAPI = this.isResponseAPIRequest(data);

    if (isResponseAPI) {
      return this.prepareResponseAPIData(data, isStream);
    } else {
      return this.prepareChatCompletionData(data, isStream);
    }
  }

  /**
   * Check if the request is for Response API
   */
  private isResponseAPIRequest(data: any): boolean {
    // Response API specific indicators
    return !!(
      data.input ||  // Response API uses 'input' instead of 'messages' in some cases
      data.store ||  // Response API specific parameter
      (data.tools && this.hasResponseAPITools(data.tools)) // Response API specific tools
    );
  }

  /**
   * Check if tools array contains Response API specific tools
   * Uses a more flexible approach to detect built-in tools vs function tools
   */
  private hasResponseAPITools(tools: any[]): boolean {
    if (!Array.isArray(tools)) {
      return false;
    }
    
    return tools.some(tool => {
      if (!tool || typeof tool !== 'object' || !tool.type) {
        return false;
      }
      
      // Function tools are standard across both APIs
      if (tool.type === 'function') {
        return false;
      }
      
      // Any non-function tool type indicates Response API
      // This is more flexible than hardcoding specific tool names
      return tool.type !== 'function';
    });
  }

  /**
   * Prepare data for Response API
   * Response API does NOT support stream_options parameter
   * Usage is automatically included in Response API responses
   */
  private prepareResponseAPIData(data: any, isStream: boolean): any {
    const prepared = { ...data };

    // Response API does NOT support stream_options
    // Remove it if accidentally included
    if (prepared.stream_options) {
      console.warn('⚠️  stream_options is not supported in Response API, removing it');
      delete prepared.stream_options;
    }

    // Keep input as-is (string format)
    return prepared;
  }

  /**
   * Prepare data for Chat Completions API (existing logic)
   */
  private prepareChatCompletionData(data: any, isStream: boolean): any {
    // For streaming requests, ensure usage is included
    if (isStream) {
      return {
        ...data,
        stream_options: {
          include_usage: true,
          ...(data.stream_options || {})
        }
      };
    }

    // For non-streaming requests, return as-is
    return data;
  } 

  /**
   * Forward request to OpenAI API
   */
  async forwardRequest(
    apiKey: string | null,
    path: string,
    method: string = "POST",
    data?: any,
    isStream: boolean = false
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add Authorization header only if API key is provided
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      // Prepare request data using provider-specific logic
      const finalData = this.prepareRequestData(data, isStream);

      const fullUrl = `${this.baseURL}${path}`;
      console.log(`🔄 Forwarding ${method} request to OpenAI: ${fullUrl}`);

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
      console.error(`❌ Error forwarding request to OpenAI: ${errorInfo.message}`);
      
      // Log detailed error information for debugging
      if (errorInfo.details) {
        console.error(`📋 Error details:`, {
          statusCode: errorInfo.statusCode,
          code: errorInfo.details.code,
          type: errorInfo.details.type,
          statusText: errorInfo.details.statusText,
          requestId: errorInfo.details.headers?.['x-request-id'],
        });
      }
      
      // Log request information for debugging
      console.error(`📤 Request info:`, {
        method,
        path,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        isStream
      });
      
      return { 
        error: errorInfo.message, 
        status: errorInfo.statusCode,
        details: errorInfo.details
      };
    }
  }

  /**
   * Parse response from OpenAI API
   * Supports both Chat Completions and Response API responses
   * OpenAI responses include usage information but no cost
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;
      
      // Detect Response API vs Chat Completions API by response structure
      if (this.isResponseAPIResponse(data)) {
        return this.parseResponseAPIResponse(data);
      } else {
        return this.parseChatCompletionResponse(data);
      }
    } catch (error) {
      console.error("Error parsing OpenAI response:", error);
      return null;
    }
  }

  /**
   * Check if response is from Response API
   */
  private isResponseAPIResponse(data: any): boolean {
    return !!(
      data && 
      typeof data === 'object' && 
      (data.object === 'response' || data.output || data.metadata)
    );
  }

  /**
   * Parse Response API response
   */
  private parseResponseAPIResponse(data: any): any {
    // Normalize Response API response to include consolidated usage information
    const normalized = { ...data };

    if (normalized.usage) {
      const usage = normalized.usage;
      
      // Keep the original usage structure for proper cost calculation
      // Don't modify tokens here - let UsagePolicy handle the cost calculation
      
      // Extract tool call counts if available in the response
      if (!usage.tool_calls_count && this.hasToolCalls(data)) {
        usage.tool_calls_count = this.extractToolCallCounts(data);
      }
      
      normalized.usage = usage;
    }

    return normalized;
  }

  /**
   * Check if response contains tool calls
   */
  private hasToolCalls(data: any): boolean {
    // Check various locations where tool call information might be present
    return !!(
      data.choices?.some((choice: any) => choice.message?.tool_calls) ||
      data.tool_calls ||
      data.output?.tool_calls
    );
  }

  /**
   * Extract tool call counts from response data
   */
  private extractToolCallCounts(data: any): Record<string, number> {
    const counts: Record<string, number> = {};
    
    // Extract from choices
    if (data.choices) {
      for (const choice of data.choices) {
        if (choice.message?.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            if (toolCall.type && toolCall.type !== 'function') {
              counts[toolCall.type] = (counts[toolCall.type] || 0) + 1;
            }
          }
        }
      }
    }
    
    // Extract from direct tool_calls array
    if (data.tool_calls) {
      for (const toolCall of data.tool_calls) {
        if (toolCall.type && toolCall.type !== 'function') {
          counts[toolCall.type] = (counts[toolCall.type] || 0) + 1;
        }
      }
    }
    
    return counts;
  }

  /**
   * Parse Chat Completions API response (existing logic)
   */
  private parseChatCompletionResponse(data: any): any {
    // OpenAI returns usage information but no cost - that's calculated by gateway
    return data;
  }

  /**
   * OpenAI doesn't provide native USD cost - returns undefined
   * Gateway will calculate cost based on token usage
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    return undefined; // OpenAI doesn't provide cost in response
  }

  /**
   * Create OpenAI-specific usage extractor
   */
  createUsageExtractor(): UsageExtractor {
    return new OpenAIUsageExtractor();
  }

  /**
   * Create OpenAI-specific stream processor
   */
  createStreamProcessor(model: string, initialCost?: number): StreamProcessor {
    return new OpenAIStreamProcessor(model, initialCost);
  }

  /**
   * Extract error information from axios error
   */
  private async extractErrorInfo(error: any): Promise<{ message: string; statusCode: number; details?: any }> {
    let errorMessage = "Unknown error occurred";
    let statusCode = 500;
    let details: any = {};

    if (error.response) {
      statusCode = error.response.status;
      let data = error.response.data;
      
      // If data is a stream (happens with responseType: 'stream'), read it first
      if (data && typeof data.on === 'function' && typeof data.read === 'function') {
        try {
          console.error('📖 Reading error stream...');
          const chunks: Buffer[] = [];
          
          // Read all chunks from the stream
          for await (const chunk of data) {
            chunks.push(Buffer.from(chunk));
          }
          
          const rawText = Buffer.concat(chunks).toString('utf-8');
          console.error('📄 Raw error response:', rawText.slice(0, 500));
          
          // Try to parse as JSON
          try {
            data = JSON.parse(rawText);
          } catch {
            // If not JSON, use raw text
            data = rawText;
          }
        } catch (streamError) {
          console.error('❌ Failed to read error stream:', streamError);
          data = null;
        }
      }
      
      if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
        // Safely extract error message without JSON.stringify to avoid circular reference errors
        errorMessage = data.error?.message 
          || data.message 
          || `Error response with status ${statusCode}`;
        
        details = {
          code: data.error?.code || data.code,
          type: data.error?.type || data.type,
          param: data.error?.param || data.param, // OpenAI often includes which parameter caused the error
          statusText: error.response.statusText,
          headers: {
            'x-request-id': error.response.headers['x-request-id'],
            'openai-organization': error.response.headers['openai-organization'],
            'openai-processing-ms': error.response.headers['openai-processing-ms'],
          },
          // Include full error object for detailed debugging (but safely)
          rawError: data.error || data
        };
        
        // Log the full error response for debugging (with safe extraction)
        console.error('🔍 Full OpenAI error response:', {
          statusCode,
          errorCode: data.error?.code || data.code,
          errorType: data.error?.type || data.type,
          errorParam: data.error?.param || data.param,
          errorMessage: errorMessage,
          // Log first 500 chars of any additional fields
          additionalFields: Object.keys(data.error || data).filter(k => 
            !['message', 'code', 'type', 'param'].includes(k)
          ).slice(0, 5)
        });
      } else if (typeof data === 'string') {
        errorMessage = data;
        details = {
          type: 'string_response',
          rawError: data
        };
      } else {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
        details = {
          statusText: error.response.statusText
        };
      }
    } else if (error.request) {
      errorMessage = "No response received from OpenAI";
      statusCode = 503;
      details = {
        type: 'network_error',
        message: 'Request was made but no response was received'
      };
    } else {
      errorMessage = error.message || "Unknown error";
      details = {
        type: 'request_setup_error',
        message: errorMessage
      };
    }

    return { message: errorMessage, statusCode, details };
  }
}
