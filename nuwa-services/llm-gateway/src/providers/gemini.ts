import axios, { AxiosResponse } from 'axios';
import { Request } from 'express';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { TestableLLMProvider, StreamExtractor, StreamExtractionResult, ModelExtractor, ModelExtractionResult } from './LLMProvider.js';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { GeminiUsageExtractor } from '../billing/usage/providers/GeminiUsageExtractor.js';
import { GeminiStreamProcessor } from '../billing/usage/providers/GeminiStreamProcessor.js';
import { GEMINI_PATHS } from './constants.js';

/**
 * Google Gemini Provider Implementation
 * Handles requests to Google Gemini API using Gemini native format
 */
export class GeminiProvider extends BaseLLMProvider implements TestableLLMProvider {
  private baseURL: string;

  // Provider name
  readonly providerName = 'gemini';

  // Define supported paths for this provider
  readonly SUPPORTED_PATHS = [
    GEMINI_PATHS.CHAT_COMPLETIONS,
    GEMINI_PATHS.STREAM_CHAT_COMPLETIONS,
  ] as const;

  constructor() {
    super();
    this.baseURL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  }

  /**
   * Prepare request data for Google Gemini API
   * Expects Gemini native format only
   */
  prepareRequestData(data: any, isStream: boolean): any {
    return data;
  }

  /**
   * Forward request to Google Gemini API
   * Uses query parameter for API key authentication
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

      // Gemini uses query parameter for API key authentication
      let fullUrl = `${this.baseURL}${path}`;
      const queryParams = new URLSearchParams();

      if (apiKey) {
        queryParams.append('key', apiKey);
      }

      // Add alt=sse parameter for streaming requests to enable Server-Sent Events format
      if (isStream) {
        queryParams.append('alt', 'sse');
      }

      const queryString = queryParams.toString();
      if (queryString) {
        fullUrl = `${fullUrl}?${queryString}`;
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
   * Parse response from Google Gemini API
   * Normalizes Gemini response format to be compatible with gateway expectations
   * Converts Gemini functionCall responses to OpenAI-compatible tool_calls format
   */
  parseResponse(response: AxiosResponse): any {
    try {
      const data = response.data;

      // Convert Gemini function calls to OpenAI tool_calls format if present
      if (data.candidates && Array.isArray(data.candidates)) {
        for (const candidate of data.candidates) {
          if (candidate.content?.parts) {
            const toolCalls = this.extractToolCallsFromParts(candidate.content.parts);

            // If tool calls found, add them to the candidate in OpenAI format
            if (toolCalls.length > 0) {
              // Create a message structure compatible with OpenAI format
              if (!candidate.message) {
                candidate.message = {
                  role: 'assistant',
                  content: null,
                  tool_calls: toolCalls,
                };
              } else {
                candidate.message.tool_calls = toolCalls;
              }
            }
          }
        }
      }

      // Add tool_calls_count to usageMetadata if function calls are present
      if (data.usageMetadata && this.hasToolCalls(data)) {
        const toolCallCounts = this.extractToolCallCounts(data);
        if (Object.keys(toolCallCounts).length > 0) {
          data.usageMetadata.tool_calls_count = toolCallCounts;
        }
      }

      return data;
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      return null;
    }
  }

  /**
   * Extract tool calls from Gemini response parts
   * Gemini: parts[{ functionCall: { name, args } }]
   * OpenAI: tool_calls[{ id, type, function: { name, arguments } }]
   */
  private extractToolCallsFromParts(parts: any[]): any[] {
    const toolCalls: any[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.functionCall) {
        toolCalls.push({
          // Generate unique ID: timestamp + random string + index
          // This prevents duplicates even if multiple calls happen in the same millisecond
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${i}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }

    return toolCalls;
  }

  /**
   * Check if Gemini response contains function calls
   */
  private hasToolCalls(data: any): boolean {
    if (!data.candidates || !Array.isArray(data.candidates)) {
      return false;
    }

    return data.candidates.some((candidate: any) => {
      if (!candidate.content?.parts) {
        return false;
      }
      return candidate.content.parts.some((part: any) => !!part.functionCall);
    });
  }

  /**
   * Extract tool call counts from Gemini response
   * For Gemini, all function calls are counted as 'function' type
   * This is compatible with the gateway's cost calculation system
   */
  private extractToolCallCounts(data: any): Record<string, number> {
    let functionCallCount = 0;

    if (data.candidates && Array.isArray(data.candidates)) {
      for (const candidate of data.candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              functionCallCount++;
            }
          }
        }
      }
    }

    // Return counts in the format expected by the gateway
    // Note: Gemini only supports function calls, not other tool types
    return functionCallCount > 0 ? { function: functionCallCount } : {};
  }

  /**
   * Gemini doesn't provide native USD cost - returns undefined
   * Gateway will calculate cost based on token usage
   */
  extractProviderUsageUsd(response: AxiosResponse): number | undefined {
    return undefined; // Gemini doesn't provide cost in response
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
   * Create Gemini-specific stream extractor
   * Determines if request is streaming based on URL path
   */
  createStreamExtractor(): StreamExtractor {
    return new GeminiStreamExtractor();
  }

  /**
   * Create Gemini-specific model extractor
   * Extracts model from URL path instead of request body
   */
  createModelExtractor(): ModelExtractor {
    return new GeminiModelExtractor();
  }

  /**
   * Get test models for Gemini provider
   * Implementation of TestableLLMProvider interface
   */
  getTestModels(): string[] {
    return [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash-lite',
    ];
  }

  /**
   * Get default test options
   * Implementation of TestableLLMProvider interface
   */
  getDefaultTestOptions(): Record<string, any> {
    return {
      model: 'gemini-2.5-flash',
      message: 'Hello, this is a test message.',
      maxTokens: 50,
      temperature: 0.7,
    };
  }

  /**
   * Create test request for the given endpoint
   * Implementation of TestableLLMProvider interface
   * Uses Gemini native format
   */
  createTestRequest(endpoint: string, options: Record<string, any> = {}): any {
    const defaults = this.getDefaultTestOptions();
    const model = options.model || defaults.model;

    // Determine if this is a streaming request
    const isStream = options.stream || false;

    // Use the appropriate endpoint based on stream flag
    let finalEndpoint = endpoint;
    if (endpoint.includes('{model}')) {
      finalEndpoint = endpoint.replace('{model}', model);
    }

    // Use Gemini contents format
    let contents: any[];
    if (options.contents) {
      // Use provided contents directly
      contents = options.contents;
    } else {
      // Use default message
      const message = options.message || defaults.message;
      contents = [
        {
          parts: [{ text: message }],
        },
      ];
    }

    // Build Gemini request
    const request: any = {
      contents,
    };

    // Add generation config if specified
    if (options.maxTokens || options.temperature !== undefined) {
      request.generationConfig = {};
      if (options.maxTokens) {
        request.generationConfig.maxOutputTokens = options.maxTokens;
      }
      if (options.temperature !== undefined) {
        request.generationConfig.temperature = options.temperature;
      }
    }

    return request;
  }
}

/**
 * Gemini-specific stream extractor
 * Determines if a request is streaming based on the URL path
 *
 * Gemini uses different endpoints for streaming vs non-streaming:
 * - Non-streaming: /v1beta/models/{model}:generateContent
 * - Streaming: /v1beta/models/{model}:streamGenerateContent
 */
class GeminiStreamExtractor implements StreamExtractor {
  /**
   * Extract stream information from request
   * For Gemini, streaming is determined by the URL path:
   * - Path contains `:streamGenerateContent` -> streaming request
   * - Path contains `:generateContent` (without stream prefix) -> non-streaming request
   */
  extractStream(req: Request, path: string): StreamExtractionResult {
    // Check if the path contains the streaming indicator
    const isStream = path.includes(':streamGenerateContent');

    return {
      isStream,
      source: 'path', // Gemini determines streaming from path, not from request body
      extractedData: {
        path: path,
        method: req.method,
      },
    };
  }
}

/**
 * Gemini-specific model extractor
 * Prioritizes extracting model from request body (default behavior),
 * then falls back to URL path extraction if body doesn't contain model.
 *
 * Example paths:
 * - /v1/models/gemini-2.0-flash-exp:generateContent
 * - /v1/models/gemini-1.5-flash:streamGenerateContent
 * - /v1beta/models/gemini-pro:generateContent
 */
class GeminiModelExtractor implements ModelExtractor {
  /**
   * Extract model from request
   * Priority:
   * 1. Request body (default implementation - allows users to override model)
   * 2. URL path (fallback - extracts from Gemini's path pattern)
   */
  extractModel(req: Request, path: string): ModelExtractionResult | undefined {
    // Priority 1: Extract from request body (default implementation)
    // This allows users to explicitly specify the model in the request
    if (req.body && typeof req.body === 'object' && req.body.model) {
      return {
        model: req.body.model,
        source: 'body',
        extractedData: { ...req.body },
      };
    }

    // Priority 2: Fallback to URL path extraction
    // Pattern to match: /v1/models/{model}:generateContent or :streamGenerateContent
    // Matches both /v1/ and /v1beta/ prefixes
    // Note: streamGenerateContent has uppercase 'G', while generateContent has lowercase 'g'
    const modelMatch = path.match(/\/v1(?:beta)?\/models\/([^:]+):(streamGenerateContent|generateContent)/);

    if (modelMatch && modelMatch[1]) {
      return {
        model: modelMatch[1],
        source: 'path',
        extractedData: {
          path: path,
          extractedFrom: 'gemini-url-pattern',
        },
      };
    }

    return undefined;
  }
}
