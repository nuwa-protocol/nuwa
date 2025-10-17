import { AxiosResponse } from 'axios';
import { UsageInfo, PricingResult } from '../../pricing.js';

/**
 * Interface for extracting usage information from provider responses
 * Each provider can implement this interface to handle their specific response formats
 */
export interface UsageExtractor {
  /**
   * Extract usage information from a non-streaming response
   * @param response The HTTP response from the provider
   * @returns UsageInfo object or null if extraction fails
   */
  extractFromResponse(response: AxiosResponse): UsageInfo | null;

  /**
   * Extract usage information from a streaming response body
   * @param responseBody The parsed response body
   * @returns UsageInfo object or null if extraction fails
   */
  extractFromResponseBody(responseBody: any): UsageInfo | null;

  /**
   * Extract usage information and cost from streaming SSE chunk
   * @param chunkText The raw SSE chunk text
   * @returns Object with usage info and optional cost, or null if no usage found
   */
  extractFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null;

  /**
   * Calculate cost for the given model and usage
   * @param model The model name
   * @param usage The usage information
   * @returns PricingResult or null if calculation fails
   */
  calculateCost(model: string, usage: UsageInfo): PricingResult | null;

  /**
   * Extract provider-specific USD cost from response (if available)
   * @param response The HTTP response from the provider
   * @returns USD cost or undefined if not available
   */
  extractProviderCost(response: AxiosResponse): number | undefined;
}
