import axios, { AxiosResponse } from "axios";
import { LLMProvider } from "./LLMProvider.js";

/**
 * OpenAI Provider Implementation
 * Handles native OpenAI API requests without cost calculation
 * Cost calculation is done by the gateway pricing system
 */
export class OpenAIProvider implements LLMProvider {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  }

  /**
   * Prepare request data for OpenAI API
   * Injects stream_options.include_usage for streaming requests
   */
  prepareRequestData(data: any, isStream: boolean): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

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
      const errorInfo = this.extractErrorInfo(error);
      console.error(`Error forwarding request to OpenAI: ${errorInfo.message}`);
      return { 
        error: errorInfo.message, 
        status: errorInfo.statusCode,
        details: errorInfo
      };
    }
  }

  /**
   * Parse non-streaming response
   * OpenAI responses include usage information but no cost
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;
      // OpenAI returns usage information but no cost - that's calculated by gateway
      return data;
    } catch (error) {
      console.error("Error parsing OpenAI response:", error);
      return null;
    }
  }

  /**
   * OpenAI doesn't provide native USD cost - returns undefined
   * Gateway will calculate cost based on token usage
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    return undefined; // OpenAI doesn't provide cost in response
  }

  /**
   * Extract error information from axios error
   */
  private extractErrorInfo(error: any): { message: string; statusCode: number; details?: any } {
    let errorMessage = "Unknown error occurred";
    let statusCode = 500;
    let details: any = {};

    if (error.response) {
      statusCode = error.response.status;
      const data = error.response.data;
      
      if (data && typeof data === 'object') {
        errorMessage = data.error?.message || data.message || JSON.stringify(data);
        details = {
          code: data.error?.code || data.code,
          type: data.error?.type || data.type,
          statusText: error.response.statusText,
          headers: {
            'x-request-id': error.response.headers['x-request-id'],
            'openai-organization': error.response.headers['openai-organization'],
            'openai-processing-ms': error.response.headers['openai-processing-ms'],
          }
        };
      } else {
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
      }
    } else if (error.request) {
      errorMessage = "No response received from OpenAI";
      statusCode = 503;
    } else {
      errorMessage = error.message;
    }

    return { message: errorMessage, statusCode, details };
  }
}
