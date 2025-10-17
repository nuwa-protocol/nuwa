import { Request, Response } from 'express';
import { UsageInfo, PricingResult, pricingRegistry } from '../pricing.js';
import { CostCalculator } from './CostCalculator.js';
import { providerRegistry } from '../../providers/registry.js';
import { StreamProcessor } from './interfaces/StreamProcessor.js';
import { UsageExtractor } from './interfaces/UsageExtractor.js';
import { DefaultUsageExtractor } from './DefaultUsageExtractor.js';
import { DefaultStreamProcessor } from './DefaultStreamProcessor.js';

/**
 * Adapter layer that connects the new modular architecture with the existing UsagePolicy interface
 * Maintains backward compatibility while delegating to provider-specific implementations
 */
export class UsagePolicyAdapter {
  /**
   * Global pricing multiplier helpers (delegated to CostCalculator)
   */
  static getPricingMultiplier(): number {
    return CostCalculator.getPricingMultiplier();
  }

  /**
   * Apply global multiplier to a USD cost (delegated to CostCalculator)
   */
  private static applyMultiplier(costUsd: number | undefined): number | undefined {
    return CostCalculator.applyMultiplier(costUsd);
  }

  /**
   * Extract usage information from non-streaming response
   * Uses provider-specific extractor if available, otherwise falls back to default logic
   */
  static extractUsageFromResponse(responseBody: any, providerName?: string): UsageInfo | null {
    try {
      // Try to get provider-specific extractor
      if (providerName) {
        const provider = providerRegistry.getProvider(providerName);
        if (provider?.createUsageExtractor) {
          const extractor = provider.createUsageExtractor();
          const result = extractor.extractFromResponseBody(responseBody);
          if (result) {
            console.log(`[UsagePolicyAdapter] Used ${providerName} extractor for response`);
            return result;
          }
        }
      }

      // Fallback to default extraction logic
      console.log('[UsagePolicyAdapter] Using default extraction logic');
      const defaultExtractor = new DefaultUsageExtractor();
      return defaultExtractor.extractFromResponseBody(responseBody);
    } catch (error) {
      console.error('[UsagePolicyAdapter] Error extracting usage from response:', error);
      return null;
    }
  }

  /**
   * Extract usage information and cost from streaming SSE data
   * Uses provider-specific extractor if available, otherwise falls back to default logic
   */
  static extractUsageFromStreamChunk(chunkText: string, providerName?: string): { usage: UsageInfo; cost?: number } | null {
    try {
      // Try to get provider-specific extractor
      if (providerName) {
        const provider = providerRegistry.getProvider(providerName);
        if (provider?.createUsageExtractor) {
          const extractor = provider.createUsageExtractor();
          const result = extractor.extractFromStreamChunk(chunkText);
          if (result) {
            console.log(`[UsagePolicyAdapter] Used ${providerName} extractor for stream chunk`);
            return result;
          }
        }
      }

      // Fallback to default extraction logic
      console.log('[UsagePolicyAdapter] Using default extraction logic for stream chunk');
      const defaultExtractor = new DefaultUsageExtractor();
      return defaultExtractor.extractFromStreamChunk(chunkText);
    } catch (error) {
      console.error('[UsagePolicyAdapter] Error extracting usage from stream chunk:', error);
      return null;
    }
  }

  /**
   * Calculate cost for a request, preferring provider cost over gateway pricing
   * Delegated to CostCalculator with enhanced functionality
   */
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo
  ): PricingResult | null {
    return CostCalculator.calculateRequestCost(model, providerCostUsd, usage);
  }

  /**
   * Set usage cost in response locals for PaymentKit billing
   * Matches the original UsagePolicy implementation
   */
  static setResponseUsage(res: Response, costUsd: number, source: string): void {
    try {
      const picoUsd = Math.round(Number(costUsd || 0) * 1e12);
      (res as any).locals = (res as any).locals || {};
      (res as any).locals.usage = picoUsd;
      
      // Also set in access log for tracking
      if ((res as any).locals.accessLog) {
        (res as any).locals.accessLog.total_cost_usd = costUsd;
        (res as any).locals.accessLog.usage_source = source;
        (res as any).locals.accessLog.pricing_version = pricingRegistry.getVersion();
      }
      
      console.log(`💰 [UsagePolicyAdapter] Set response usage: $${costUsd} (${source})`);
    } catch (error) {
      console.error('[UsagePolicyAdapter] Error setting response usage:', error);
    }
  }

  /**
   * Process non-streaming response and calculate cost
   * Enhanced with provider-specific logic
   */
  static processNonStreamResponse(
    model: string,
    responseBody: any,
    providerCostUsd?: number,
    providerName?: string
  ): PricingResult | null {
    try {
      console.log(`💰 [UsagePolicyAdapter] Processing non-stream response for ${model}`);

      // Extract usage using provider-specific or default logic
      const usage = this.extractUsageFromResponse(responseBody, providerName);
      if (!usage) {
        console.warn(`⚠️  [UsagePolicyAdapter] No usage extracted from response`);
        return null;
      }

      // Calculate cost
      const result = this.calculateRequestCost(model, providerCostUsd, usage);
      if (result) {
        console.log(`✅ [UsagePolicyAdapter] Calculated cost: $${result.costUsd} (${result.source})`);
      }

      return result;
    } catch (error) {
      console.error('[UsagePolicyAdapter] Error processing non-stream response:', error);
      return null;
    }
  }

  /**
   * Create a stream processor for billing
   * Uses provider-specific processor if available, otherwise falls back to default
   */
  static createStreamProcessor(
    model: string, 
    providerCostUsd?: number, 
    providerName?: string
  ): StreamProcessorCompat {
    try {
      let processor: StreamProcessor;

      // Try to get provider-specific processor
      if (providerName) {
        const provider = providerRegistry.getProvider(providerName);
        if (provider?.createStreamProcessor) {
          processor = provider.createStreamProcessor(model, providerCostUsd);
          console.log(`[UsagePolicyAdapter] Created ${providerName} stream processor`);
        } else {
          // Fallback to default processor
          const defaultExtractor = new DefaultUsageExtractor();
          processor = new DefaultStreamProcessor(model, defaultExtractor, providerCostUsd);
          console.log('[UsagePolicyAdapter] Created default stream processor');
        }
      } else {
        // No provider specified, use default
        const defaultExtractor = new DefaultUsageExtractor();
        processor = new DefaultStreamProcessor(model, defaultExtractor, providerCostUsd);
        console.log('[UsagePolicyAdapter] Created default stream processor (no provider)');
      }

      // Wrap in compatibility layer to match existing interface
      return new StreamProcessorCompat(processor);
    } catch (error) {
      console.error('[UsagePolicyAdapter] Error creating stream processor:', error);
      // Return a fallback processor
      const defaultExtractor = new DefaultUsageExtractor();
      const fallbackProcessor = new DefaultStreamProcessor(model, defaultExtractor, providerCostUsd);
      return new StreamProcessorCompat(fallbackProcessor);
    }
  }

  /**
   * Inject stream usage options into request data
   * This is a utility method that doesn't need provider-specific logic
   */
  static injectStreamUsageOption(requestData: any): any {
    if (!requestData || typeof requestData !== 'object') {
      return requestData;
    }

    // For streaming requests, ensure usage is included
    if (requestData.stream) {
      return {
        ...requestData,
        stream_options: {
          include_usage: true,
          ...(requestData.stream_options || {})
        }
      };
    }

    return requestData;
  }
}

/**
 * Compatibility wrapper to match the existing stream processor interface
 * Wraps the new StreamProcessor interface to match the old return object format
 */
export class StreamProcessorCompat {
  private processor: StreamProcessor;

  constructor(processor: StreamProcessor) {
    this.processor = processor;
  }

  processChunk = (chunkText: string): void => {
    this.processor.processChunk(chunkText);
  };

  getFinalCost = (): PricingResult | null => {
    return this.processor.getFinalCost();
  };

  getFinalUsage = (): UsageInfo | null => {
    return this.processor.getFinalUsage();
  };

  getAccumulatedResponse = (): any | null => {
    return this.processor.getAccumulatedResponse();
  };
}
