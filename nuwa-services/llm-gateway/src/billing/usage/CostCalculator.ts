import { UsageInfo, PricingResult, pricingRegistry } from '../pricing.js';
import { calculateToolCallCost } from '../../config/toolPricing.js';
import { ToolCallCounts } from '../../types/index.js';

/**
 * Independent cost calculation module
 * Handles both token-based and tool-based cost calculations
 */
export class CostCalculator {
  private static cachedMultiplier: number | null = null;

  /**
   * Read and cache PRICING_MULTIPLIER from env; clamp to [0, 2]
   */
  static getPricingMultiplier(): number {
    if (this.cachedMultiplier !== null) return this.cachedMultiplier;
    const raw = process.env.PRICING_MULTIPLIER;
    const parsed = raw !== undefined ? Number(raw) : 1.0;
    let value = Number.isFinite(parsed) ? parsed : 1.0;
    if (value < 0) value = 0;
    if (value > 2) value = 2;
    this.cachedMultiplier = value;
    return value;
  }

  /**
   * Apply global multiplier to a USD cost
   */
  static applyMultiplier(costUsd: number | undefined): number | undefined {
    if (typeof costUsd !== 'number' || !Number.isFinite(costUsd)) return undefined;
    return costUsd * this.getPricingMultiplier();
  }

  /**
   * Calculate cost for a request, preferring provider cost over gateway pricing
   */
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo,
    toolCalls?: ToolCallCounts
  ): PricingResult | null {
    console.log('🧮 [CostCalculator] Input:', {
      model,
      providerCostUsd,
      usage: usage ? `${usage.promptTokens}p + ${usage.completionTokens}c = ${usage.totalTokens}t` : 'undefined',
      toolCalls: toolCalls ? Object.keys(toolCalls).length + ' tools' : 'none'
    });

    // Prefer provider-supplied cost if available
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      console.log('💰 [CostCalculator] Using provider cost:', providerCostUsd);
      return {
        costUsd: this.applyMultiplier(providerCostUsd)!,
        source: 'provider',
        model,
        usage,
      };
    }

    // Fallback to gateway pricing calculation
    if (usage && (usage.promptTokens || usage.completionTokens)) {
      console.log('📊 [CostCalculator] Using gateway pricing for:', model);
      
      // 1. Calculate model token cost
      const modelCostResult = pricingRegistry.calculateCost(model, usage);
      const modelCost = modelCostResult?.costUsd || 0;

      // 2. Calculate tool call costs
      let toolCallCost = 0;
      if (toolCalls) {
        for (const [toolName, callCount] of Object.entries(toolCalls)) {
          if (typeof callCount === 'number' && callCount > 0) {
            const cost = calculateToolCallCost(toolName, callCount);
            toolCallCost += cost;
            console.log(`💰 [CostCalculator] ${toolName}: ${callCount} calls = $${cost.toFixed(6)}`);
          }
        }
      }

      // 3. Total cost
      const totalCost = modelCost + toolCallCost;

      if (modelCostResult) {
        console.log(`💰 [CostCalculator] Cost breakdown - Model: $${modelCost.toFixed(6)}, Tools: $${toolCallCost.toFixed(6)}, Total: $${totalCost.toFixed(6)}`);
        const finalCost = this.applyMultiplier(totalCost);
        if (finalCost !== undefined) {
          return {
            ...modelCostResult,
            costUsd: finalCost,
            usage,
          };
        }
      } else {
        console.warn(`⚠️  [CostCalculator] Gateway pricing failed for model: ${model}`);
      }
    } else {
      console.warn('⚠️  [CostCalculator] No valid usage data provided');
    }

    // No cost calculation possible
    console.warn(`⚠️  [CostCalculator] Unable to calculate cost for model ${model}`);
    return null;
  }

  /**
   * Calculate cost specifically for Response API with tool call support
   */
  static calculateResponseAPICost(
    model: string,
    usage: any,
    responseBody?: any,
    providerCostUsd?: number
  ): PricingResult | null {
    console.log(`💰 [CostCalculator] Calculating Response API cost for ${model}`);

    // Prefer provider cost if available
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      console.log('💰 [CostCalculator] Using provider cost for Response API:', providerCostUsd);
      const usageInfo = this.extractUsageInfo(usage);
      return {
        costUsd: this.applyMultiplier(providerCostUsd)!,
        source: 'provider',
        model,
        usage: usageInfo || undefined,
      };
    }

    // Extract usage information
    const usageInfo = this.extractUsageInfo(usage);
    if (!usageInfo) {
      return null;
    }

    // Calculate model token cost
    const modelCostResult = pricingRegistry.calculateCost(model, usageInfo);
    const modelCost = modelCostResult?.costUsd || 0;

    // Calculate tool call costs from response body
    let toolCallCost = 0;
    if (responseBody) {
      const toolCalls = this.parseToolCallsFromOutput(responseBody);
      for (const [toolName, callCount] of Object.entries(toolCalls)) {
        if (typeof callCount === 'number' && callCount > 0) {
          const cost = calculateToolCallCost(toolName, callCount);
          toolCallCost += cost;
          console.log(`💰 [CostCalculator] ${toolName}: ${callCount} calls = $${cost.toFixed(6)}`);
        }
      }
    }

    // Fallback: Calculate tool call costs from usage.tool_calls_count (legacy)
    if (toolCallCost === 0 && usage.tool_calls_count) {
      console.log('📊 [CostCalculator] Using legacy tool_calls_count from usage');
      for (const [toolName, callCount] of Object.entries(usage.tool_calls_count)) {
        if (typeof callCount === 'number' && callCount > 0) {
          const cost = calculateToolCallCost(toolName, callCount);
          toolCallCost += cost;
        }
      }
    }

    // Total cost
    const totalCost = modelCost + toolCallCost;

    console.log(`💰 [CostCalculator] Cost breakdown - Model: $${modelCost.toFixed(6)}, Tools: $${toolCallCost.toFixed(6)}, Total: $${totalCost.toFixed(6)}`);

    return {
      costUsd: this.applyMultiplier(totalCost)!,
      source: 'gateway-pricing',
      pricingVersion: pricingRegistry.getVersion(),
      model,
      usage: usageInfo,
    };
  }

  /**
   * Extract usage information from various formats
   */
  private static extractUsageInfo(usage: any): UsageInfo | null {
    if (!usage || typeof usage !== 'object') {
      return null;
    }

    // Check if this is Response API format
    if (usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
      return this.extractResponseAPIUsage(usage);
    } else if (usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined) {
      return this.extractChatCompletionUsage(usage);
    }

    return null;
  }

  /**
   * Extract usage from Response API format
   */
  private static extractResponseAPIUsage(usage: any): UsageInfo {
    const baseInputTokens = usage.input_tokens || 0;
    const baseOutputTokens = usage.output_tokens || 0;
    
    // Extract tool-related tokens dynamically
    let toolTokens = 0;
    const keys = Object.keys(usage);
    
    for (const key of keys) {
      if (key.endsWith('_tokens') && 
          key !== 'input_tokens' && 
          key !== 'output_tokens' && 
          key !== 'total_tokens') {
        const tokenValue = usage[key];
        if (typeof tokenValue === 'number' && tokenValue > 0) {
          toolTokens += tokenValue;
        }
      }
    }
    
    const promptTokens = baseInputTokens + toolTokens;
    const completionTokens = baseOutputTokens;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    
    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  /**
   * Extract usage from Chat Completions format
   */
  private static extractChatCompletionUsage(usage: any): UsageInfo {
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    };
  }

  /**
   * Parse tool calls from Response API output array
   */
  private static parseToolCallsFromOutput(responseBody: any): ToolCallCounts {
    const toolCalls: ToolCallCounts = {};
    
    try {
      // Check if response has output array
      if (!responseBody?.output || !Array.isArray(responseBody.output)) {
        return toolCalls;
      }

      // Count tool calls by type
      for (const outputItem of responseBody.output) {
        if (outputItem && typeof outputItem === 'object' && outputItem.type) {
          const toolType = outputItem.type;
          
          // Skip text outputs, only count actual tool calls
          if (toolType !== 'text' && toolType !== 'message') {
            const currentCount = (toolCalls as any)[toolType] || 0;
            (toolCalls as any)[toolType] = currentCount + 1;
            console.log(`📊 [CostCalculator] Found tool call: ${toolType}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ [CostCalculator] Error parsing tool calls from output:', error);
    }
    
    return toolCalls;
  }
}
