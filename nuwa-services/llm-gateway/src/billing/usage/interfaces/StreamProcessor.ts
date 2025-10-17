import { UsageInfo, PricingResult } from '../../pricing.js';

/**
 * Interface for processing streaming responses and extracting usage/cost information
 * Each provider can implement this interface to handle their specific streaming formats
 */
export interface StreamProcessor {
  /**
   * Process a chunk of streaming data
   * @param chunkText The raw chunk text from the stream
   */
  processChunk(chunkText: string): void;

  /**
   * Get the final calculated cost after processing all chunks
   * @returns PricingResult or null if no cost could be calculated
   */
  getFinalCost(): PricingResult | null;

  /**
   * Get the final usage information after processing all chunks
   * @returns UsageInfo or null if no usage was extracted
   */
  getFinalUsage(): UsageInfo | null;

  /**
   * Get the accumulated response body (if available)
   * Used for extracting additional information like tool calls
   * @returns The accumulated response body or null
   */
  getAccumulatedResponse(): any | null;

  /**
   * Reset the processor state for reuse
   */
  reset(): void;
}
