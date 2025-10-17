import { AxiosResponse } from "axios";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";

/**
 * Unified interface for LLM providers
 * Supports both streaming and non-streaming requests
 */
export interface LLMProvider {
  /**
   * Forward a request to the provider
   * @param apiKey User's API key for this provider (null if provider doesn't require API key)
   * @param path API path (e.g., '/chat/completions')
   * @param method HTTP method
   * @param data Request payload
   * @param isStream Whether this is a streaming request
   */
  forwardRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any,
    isStream?: boolean
  ): Promise<AxiosResponse | { error: string; status?: number; details?: any } | null>;

  /**
   * Parse non-streaming response and extract usage information
   */
  parseResponse(response: AxiosResponse): any;

  /**
   * Extract USD cost from provider response (optional)
   * Returns undefined if provider doesn't provide native USD cost
   */
  extractProviderUsageUsd?(response: AxiosResponse): number | undefined;

  /**
   * Prepare request data for this provider (optional)
   * Allows provider-specific modifications like injecting usage tracking options
   * @param data Original request data
   * @param isStream Whether this is a streaming request
   * @returns Modified request data
   */
  prepareRequestData?(data: any, isStream: boolean): any;

  /**
   * Create a usage extractor for this provider (optional)
   * Returns a provider-specific usage extractor that can handle the provider's response formats
   * @returns UsageExtractor instance or undefined if provider uses default extraction
   */
  createUsageExtractor?(): UsageExtractor;

  /**
   * Create a stream processor for this provider (optional)
   * Returns a provider-specific stream processor for handling streaming responses
   * @param model The model name being used
   * @param initialCost Initial provider cost (if available)
   * @returns StreamProcessor instance or undefined if provider uses default processing
   */
  createStreamProcessor?(model: string, initialCost?: number): StreamProcessor;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  name: string;
  instance: LLMProvider;
  requiresApiKey: boolean;
  supportsNativeUsdCost: boolean;
  apiKey?: string; // API key value (resolved during registration, undefined if not required)
  baseUrl: string; // Provider's base URL (e.g., 'https://openrouter.ai', 'https://api.openai.com')
  allowedPaths: string[]; // Allowed path patterns for security (e.g., ['/api/v1/chat/completions', '/api/v1/models'])
}

/**
 * Request metadata for provider operations
 */
export interface ProviderRequestMeta {
  provider: string;
  model?: string;
  isStream: boolean;
  startTime: number;
}

/**
 * Response metadata from provider operations
 */
export interface ProviderResponseMeta {
  provider: string;
  statusCode?: number;
  durationMs: number;
  usageSource?: 'body' | 'header' | 'stream' | 'local-pricing';
  usageUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}
