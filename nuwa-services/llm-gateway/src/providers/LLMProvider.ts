import { AxiosResponse } from 'axios';
import { Request } from 'express';
import { UsageExtractor } from '../billing/usage/interfaces/UsageExtractor.js';
import { StreamProcessor } from '../billing/usage/interfaces/StreamProcessor.js';
import { UsageInfo, PricingResult } from '../billing/pricing.js';

/**
 * Response from non-streaming provider request
 * Contains complete response data, usage, and cost information
 */
export interface ExecuteResponse {
  success: boolean;
  statusCode?: number;
  response?: any; // Parsed response body
  usage?: UsageInfo; // Extracted usage information
  cost?: PricingResult; // Calculated cost
  error?: string;
  details?: any; // Raw error details
  rawResponse?: AxiosResponse;
  // New fields for enhanced tracing and error handling
  upstreamRequestId?: string; // Upstream request ID for tracing
  errorCode?: string; // Provider error code (e.g., 'invalid_api_key')
  errorType?: string; // Provider error type (e.g., 'authentication_error')
}

/**
 * Response from streaming provider request
 * Contains final statistics after stream completion
 */
export interface ExecuteStreamResponse {
  success: boolean;
  statusCode: number; // Always present
  totalBytes: number; // Always present - total bytes transferred
  usage?: UsageInfo; // Extracted usage information (if available)
  cost?: PricingResult; // Calculated cost (if available)
  error?: string; // Error message (if failed)
  details?: any; // Raw error details
  rawResponse?: AxiosResponse;
  // New fields for enhanced tracing and error handling
  upstreamRequestId?: string; // Upstream request ID for tracing
  errorCode?: string; // Provider error code (e.g., 'invalid_api_key')
  errorType?: string; // Provider error type (e.g., 'authentication_error')
}

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

  /**
   * High-level request method for non-streaming requests
   * Handles forward request, parsing, and usage extraction
   * @param apiKey User's API key for this provider
   * @param path API path (e.g., '/chat/completions')
   * @param method HTTP method
   * @param data Request payload
   * @returns Complete response with usage and cost information
   */
  executeRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data?: any
  ): Promise<ExecuteResponse>;

  /**
   * High-level request method for streaming requests
   * Automatically forwards stream to destination and returns final statistics
   * @param apiKey User's API key for this provider
   * @param path API path (e.g., '/chat/completions')
   * @param method HTTP method
   * @param data Request payload (required)
   * @param destination Target stream to forward data to (required)
   * @returns Promise that resolves with final statistics after stream completion
   */
  executeStreamRequest(
    apiKey: string | null,
    path: string,
    method: string,
    data: any,
    destination: NodeJS.WritableStream
  ): Promise<ExecuteStreamResponse>;

  /**
   * Get model extractor for this provider (optional)
   * Returns a provider-specific model extractor that can handle the provider's request formats
   * @returns ModelExtractor instance or undefined if provider uses default extraction
   */
  createModelExtractor?(): ModelExtractor;
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
 * Providers can implement these methods for better testability
 */
export interface TestableLLMProvider extends LLMProvider {
  /**
   * Get provider-specific test models for integration testing
   * @returns Array of model names that are known to work for testing
   */
  getTestModels(): string[];

  /**
   * Get default test options (model, message, maxTokens, etc.)
   * @returns Default configuration for test requests
   */
  getDefaultTestOptions(): Record<string, any>;

  /**
   * Create a test request for the given endpoint
   * Provider knows the correct format for each endpoint
   * @param endpoint API endpoint path
   * @param options Optional configuration to override defaults
   * @returns Request data ready to send to the provider
   */
  createTestRequest(endpoint: string, options?: Record<string, any>): any;
}

/**
 * Model extraction result
 */
export interface ModelExtractionResult {
  model: string;
  source: 'body' | 'query' | 'header' | 'path' | 'default';
  extractedData?: any; // Additional extracted data if needed
}

/**
 * Model extractor interface for flexible model extraction
 */
export interface ModelExtractor {
  /**
   * Extract model information from request
   * @param req Express request object
   * @param path API path being accessed
   * @returns Model extraction result or undefined if model not found
   */
  extractModel(req: Request, path: string): ModelExtractionResult | undefined;
}

/**
 * Stream extraction result
 */
export interface StreamExtractionResult {
  isStream: boolean;
  source: 'body' | 'path' | 'query' | 'header' | 'default';
  extractedData?: any; // Additional extracted data if needed
}

/**
 * Stream extractor interface for flexible stream detection
 */
export interface StreamExtractor {
  /**
   * Extract stream information from request
   * @param req Express request object
   * @param path API path being accessed
   * @returns Stream extraction result
   */
  extractStream(req: Request, path: string): StreamExtractionResult;
}
