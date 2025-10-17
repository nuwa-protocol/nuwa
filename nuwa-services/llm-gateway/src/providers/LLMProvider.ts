import { AxiosResponse } from "axios";
import { UsageExtractor } from "../billing/usage/interfaces/UsageExtractor.js";
import { StreamProcessor } from "../billing/usage/interfaces/StreamProcessor.js";

/**
 * Unified interface for LLM providers
 * Supports both streaming and non-streaming requests
 */
export interface LLMProvider {
  /**
   * Paths supported by this provider
   * Must be defined by each provider implementation
   */
  readonly SUPPORTED_PATHS: readonly string[];
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

/**
 * Test configuration for provider testing
 */
export interface ProviderTestConfig {
  skipAuth?: boolean;
  mockApiKey?: string;
  mockBaseUrl?: string;
  timeout?: number;
}

/**
 * Extended LLMProvider interface with testing support
 * Providers can optionally implement these methods for better testability
 */
export interface TestableLLMProvider extends LLMProvider {
  /**
   * Validate provider configuration for testing
   * @param config Test configuration
   * @returns Validation result with any errors
   */
  validateTestConfig?(config: ProviderTestConfig): { valid: boolean; errors: string[] };

  /**
   * Get provider-specific test models for integration testing
   * @returns Array of model names that are known to work for testing
   */
  getTestModels?(): string[];

  /**
   * Get provider-specific test endpoints for integration testing
   * @returns Array of endpoint paths that are safe to test
   */
  getTestEndpoints?(): string[];

  /**
   * Create a test instance with mock configuration
   * @param config Test configuration
   * @returns Test instance of the provider
   */
  createTestInstance?(config: ProviderTestConfig): LLMProvider;
}
