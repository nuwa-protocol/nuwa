import { StreamProcessor } from '../interfaces/StreamProcessor.js';
import { UsageExtractor } from '../interfaces/UsageExtractor.js';
import { UsageInfo, PricingResult } from '../../pricing.js';
import { CostCalculator } from '../CostCalculator.js';

/**
 * Base implementation of StreamProcessor with common functionality
 * Provider-specific processors can extend this class
 */
export abstract class BaseStreamProcessor implements StreamProcessor {
  protected accumulatedUsage: UsageInfo | null = null;
  protected extractedCost: number | undefined = undefined;
  protected finalCost: PricingResult | null = null;
  protected accumulatedResponseBody: any = null;
  protected model: string;
  protected initialProviderCost?: number;
  protected usageExtractor: UsageExtractor;

  constructor(model: string, usageExtractor: UsageExtractor, initialProviderCost?: number) {
    this.model = model;
    this.usageExtractor = usageExtractor;
    this.initialProviderCost = initialProviderCost;
  }

  /**
   * Process a chunk of streaming data
   * Delegates to provider-specific implementation and then calculates cost
   */
  processChunk(chunkText: string): void {
    try {
      // Let the provider-specific implementation handle chunk processing
      this.processProviderSpecificChunk(chunkText);
      // Try to extract usage from the chunk
      const result = this.usageExtractor.extractFromStreamChunk(chunkText);
      if (result) {
        this.accumulatedUsage = result.usage;

        // Update extracted cost if provided in stream
        if (result.cost !== undefined) {
          this.extractedCost = result.cost;
        }

        // Calculate final cost when we have usage information
        this.calculateFinalCost();
      }

      // Try to extract complete response body for additional processing
      this.tryExtractResponseBody(chunkText);
    } catch (error) {
      console.error(`[${this.constructor.name}] Error processing chunk:`, error);
    }
  }

  /**
   * Provider-specific chunk processing
   * Override in provider-specific classes for custom logic
   */
  protected processProviderSpecificChunk(chunkText: string): void {
    // Default implementation does nothing
    // Override in provider-specific classes if needed
  }

  /**
   * Calculate the final cost based on accumulated usage and provider cost
   */
  protected calculateFinalCost(): void {
    if (!this.accumulatedUsage) {
      return;
    }

    // Prefer stream-extracted cost over initial provider cost
    const finalProviderCost =
      this.extractedCost !== undefined ? this.extractedCost : this.initialProviderCost;

    console.log(
      `[${this.constructor.name}] Calculating cost - model: ${this.model}, providerCost: ${finalProviderCost}, usage:`,
      this.accumulatedUsage
    );

    // Use provider cost if available, otherwise calculate using gateway pricing
    if (typeof finalProviderCost === 'number' && finalProviderCost >= 0) {
      this.finalCost = {
        costUsd: this.applyPricingMultiplier(finalProviderCost),
        source: 'provider',
        model: this.model,
        usage: this.accumulatedUsage,
      };
    } else {
      this.finalCost = this.usageExtractor.calculateCost(this.model, this.accumulatedUsage);
    }

    if (this.finalCost) {
      console.log(
        `[${this.constructor.name}] Final cost calculated: $${this.finalCost.costUsd} (${this.finalCost.source})`
      );
    } else {
      console.warn(`[${this.constructor.name}] Failed to calculate cost`);
    }
  }

  /**
   * Try to extract complete response body from streaming chunks
   * Override in provider-specific classes for custom logic
   */
  protected tryExtractResponseBody(chunkText: string): void {
    // Default implementation does nothing
    // Override in provider-specific classes if they need to accumulate response body
  }

  /**
   * Apply global pricing multiplier to cost
   * Delegates to CostCalculator for consistency
   */
  protected applyPricingMultiplier(costUsd: number): number {
    return CostCalculator.applyMultiplier(costUsd) || costUsd;
  }

  /**
   * Get the final calculated cost
   */
  getFinalCost(): PricingResult | null {
    return this.finalCost;
  }

  /**
   * Get the final usage information
   */
  getFinalUsage(): UsageInfo | null {
    return this.accumulatedUsage;
  }

  /**
   * Get the accumulated response body
   */
  getAccumulatedResponse(): any | null {
    return this.accumulatedResponseBody;
  }

  /**
   * Reset the processor state for reuse
   */
  reset(): void {
    this.accumulatedUsage = null;
    this.extractedCost = undefined;
    this.finalCost = null;
    this.accumulatedResponseBody = null;
    console.log(`[${this.constructor.name}] Reset processor state`);
  }
}
