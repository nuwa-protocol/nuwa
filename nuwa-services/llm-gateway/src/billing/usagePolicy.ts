import { Request, Response } from 'express';
import { pricingRegistry, UsageInfo, PricingResult } from './pricing.js';
import { calculateToolCallCost, hasToolTokenDiscount } from '../config/toolPricing.js';

/**
 * Usage policy for handling token-based billing
 * Extracts usage from responses and calculates costs when needed
 */
export class UsagePolicy {
  /**
   * Extract usage information from non-streaming response
   * Supports both Chat Completions and Response API formats
   */
  static extractUsageFromResponse(responseBody: any): UsageInfo | null {
    try {
      if (!responseBody || typeof responseBody !== 'object') {
        return null;
      }

      const usage = responseBody.usage;
      if (!usage || typeof usage !== 'object') {
        return null;
      }

      // Check if this is a Response API response with extended usage info
      if (this.isResponseAPIUsage(usage)) {
        return this.extractResponseAPIUsage(usage);
      } else {
        return this.extractChatCompletionUsage(usage);
      }
    } catch (error) {
      console.error('Error extracting usage from response:', error);
      return null;
    }
  }

  /**
   * Check if usage object is from Response API
   */
  private static isResponseAPIUsage(usage: any): boolean {
    if (!usage || typeof usage !== 'object') {
      return false;
    }

    // Response API uses input_tokens/output_tokens instead of prompt_tokens/completion_tokens
    return !!(usage.input_tokens !== undefined && usage.output_tokens !== undefined);
  }

  /**
   * Extract usage from Response API format
   * Response API uses input_tokens/output_tokens field names
   */
  private static extractResponseAPIUsage(usage: any): UsageInfo {
    // Response API uses different field names
    const promptTokens = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    
    return {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
    };
  }

  /**
   * Calculate comprehensive cost for Response API including tool calls
   */
  static calculateResponseAPICost(
    model: string,
    usage: any,
    providerCostUsd?: number
  ): PricingResult | null {
    // If provider already calculated total cost, use it
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      const usageInfo = this.extractUsageFromResponse({ usage });
      return {
        costUsd: providerCostUsd,
        source: 'provider',
        model,
        usage: usageInfo || undefined,
      };
    }

    // Calculate costs separately for tokens and tool calls
    const usageInfo = this.extractUsageFromResponse({ usage });
    if (!usageInfo) {
      return null;
    }

    // 1. Calculate model token cost
    const modelCostResult = pricingRegistry.calculateCost(model, usageInfo);
    const modelCost = modelCostResult?.costUsd || 0;

    // 2. Calculate tool call costs
    let toolCallCost = 0;
    if (usage.tool_calls_count) {
      for (const [toolName, callCount] of Object.entries(usage.tool_calls_count)) {
        if (typeof callCount === 'number' && callCount > 0) {
          const cost = calculateToolCallCost(toolName, callCount);
          toolCallCost += cost;
        }
      }
    }

    // 3. Total cost
    const totalCost = modelCost + toolCallCost;

    return {
      costUsd: totalCost,
      source: 'gateway-pricing',
      pricingVersion: pricingRegistry.getVersion(),
      model,
      usage: usageInfo,
    };
  }

  /**
   * Extract usage from Chat Completions API format (existing logic)
   */
  private static extractChatCompletionUsage(usage: any): UsageInfo {
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    };
  }

  /**
   * Extract usage information and cost from streaming SSE data
   * Supports both Chat Completions and Response API streaming formats
   * Returns both token usage and cost information if available
   */
  static extractUsageFromStreamChunk(chunkText: string): { usage: UsageInfo; cost?: number } | null {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Handle Response API format: event: response.completed
        if (trimmed.startsWith('event: response.completed')) {
          // Look for the next data line
          const nextLineIndex = lines.indexOf(line) + 1;
          if (nextLineIndex < lines.length) {
            const dataLine = lines[nextLineIndex].trim();
            if (dataLine.startsWith('data: ')) {
              const dataStr = dataLine.slice(6);
              try {
                const data = JSON.parse(dataStr);
                // Response API: usage is at data.response.usage
                if (data.response && data.response.usage) {
                  console.log('📊 [UsagePolicy] Found Response API usage in stream chunk:', JSON.stringify(data.response.usage));
                  
                  const result: { usage: UsageInfo; cost?: number } = {
                    usage: this.extractUsageFromStreamData(data.response.usage)
                  };
                  
                  console.log('📊 [UsagePolicy] Extracted Response API usage info:', result.usage);
                  
                  if (typeof data.response.usage.cost === 'number') {
                    result.cost = data.response.usage.cost;
                    console.log('💰 [UsagePolicy] Found cost in Response API usage:', result.cost);
                  }
                  
                  return result;
                }
              } catch (parseError) {
                console.error('❌ [UsagePolicy] Error parsing Response API data:', parseError);
              }
            }
          }
          continue;
        }
        
        // Handle Chat Completions API format: data: {...usage...}
        if (trimmed.startsWith('data: ') && trimmed.includes('"usage"')) {
          const dataStr = trimmed.slice(6); // Remove 'data: ' prefix
          if (dataStr === '[DONE]') continue;
          
          const data = JSON.parse(dataStr);
          // Chat Completions API: usage is at root level
          if (data.usage) {
            console.log('📊 [UsagePolicy] Found Chat Completions usage in stream chunk:', JSON.stringify(data.usage));
            
            const result: { usage: UsageInfo; cost?: number } = {
              usage: this.extractUsageFromStreamData(data.usage)
            };
            
            console.log('📊 [UsagePolicy] Extracted Chat Completions usage info:', result.usage);
            
            // Also extract cost if available (OpenRouter provides this)
            if (typeof data.usage.cost === 'number') {
              result.cost = data.usage.cost;
              console.log('💰 [UsagePolicy] Found cost in Chat Completions usage:', result.cost);
            }
            
            return result;
          }
        }
      }
    } catch (error) {
      console.error('❌ [UsagePolicy] Error extracting usage from stream chunk:', error);
      console.error('Chunk text:', chunkText.slice(0, 200));
    }
    
    return null;
  }

  /**
   * Extract usage from streaming data (unified for both API types)
   */
  private static extractUsageFromStreamData(usage: any): UsageInfo {
    // Check if this is Response API usage format
    if (this.isResponseAPIUsage(usage)) {
      return this.extractResponseAPIUsage(usage);
    } else {
      return this.extractChatCompletionUsage(usage);
    }
  }

  /**
   * Inject stream_options.include_usage for OpenAI requests
   */
  static injectStreamUsageOption(requestData: any): any {
    if (!requestData || typeof requestData !== 'object') {
      return requestData;
    }

    // Only inject for streaming requests
    if (!requestData.stream) {
      return requestData;
    }

    return {
      ...requestData,
      stream_options: {
        include_usage: true,
        ...(requestData.stream_options || {})
      }
    };
  }

  /**
   * Calculate cost for a request, preferring provider cost over gateway pricing
   */
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo
  ): PricingResult | null {
    console.log('🧮 [calculateRequestCost] Input:', {
      model,
      providerCostUsd,
      usage: usage ? `${usage.promptTokens}p + ${usage.completionTokens}c = ${usage.totalTokens}t` : 'undefined'
    });

    // Prefer provider-supplied cost if available
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      console.log('💰 [calculateRequestCost] Using provider cost:', providerCostUsd);
      return {
        costUsd: providerCostUsd,
        source: 'provider',
        model,
        usage,
      };
    }

    // Fallback to gateway pricing calculation
    if (usage && (usage.promptTokens || usage.completionTokens)) {
      console.log('📊 [calculateRequestCost] Using gateway pricing for:', model);
      const result = pricingRegistry.calculateCost(model, usage);
      if (result) {
        console.log(`✅ [calculateRequestCost] Calculated via gateway: $${result.costUsd}`);
        return result;
      } else {
        console.warn(`⚠️  [calculateRequestCost] Gateway pricing failed for model: ${model}`);
      }
    } else {
      console.warn('⚠️  [calculateRequestCost] No valid usage data provided');
    }

    // No cost calculation possible
    console.warn(`⚠️  [calculateRequestCost] Unable to calculate cost for model ${model}`);
    return null;
  }

  /**
   * Set usage cost in response locals for PaymentKit billing
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
    } catch (error) {
      console.error('Error setting response usage:', error);
    }
  }

  /**
   * Process non-streaming response for billing
   */
  static processNonStreamResponse(
    model: string,
    responseBody: any,
    providerCostUsd?: number
  ): PricingResult | null {
    const usage = this.extractUsageFromResponse(responseBody);
    return this.calculateRequestCost(model, providerCostUsd, usage || undefined);
  }

  /**
   * Create a stream processor for billing
   * Returns a function that processes chunks and returns final cost
   */
  static createStreamProcessor(model: string, providerCostUsd?: number) {
    let accumulatedUsage: UsageInfo | null = null;
    let extractedCost: number | undefined = undefined;
    let finalCost: PricingResult | null = null;

    console.log(`💵 [StreamProcessor] Created for model: ${model}, initial providerCost: ${providerCostUsd}`);

    return {
      processChunk: (chunkText: string): void => {
        const result = this.extractUsageFromStreamChunk(chunkText);
        if (result) {
          console.log('✅ [StreamProcessor] Got usage from chunk');
          accumulatedUsage = result.usage;
          
          // Update extracted cost if provided in stream
          if (result.cost !== undefined) {
            extractedCost = result.cost;
            console.log(`💰 [StreamProcessor] Updated extracted cost: ${extractedCost}`);
          }
          
          // Calculate final cost when we have usage information
          // Prefer stream-extracted cost over initial provider cost
          const finalProviderCost = extractedCost !== undefined ? extractedCost : providerCostUsd;
          console.log(`🧮 [StreamProcessor] Calculating cost - model: ${model}, providerCost: ${finalProviderCost}, usage:`, accumulatedUsage);
          
          finalCost = this.calculateRequestCost(model, finalProviderCost, accumulatedUsage);
          
          if (finalCost) {
            console.log(`✅ [StreamProcessor] Final cost calculated: $${finalCost.costUsd} (${finalCost.source})`);
          } else {
            console.warn(`⚠️  [StreamProcessor] Failed to calculate cost`);
          }
        }
      },
      
      getFinalCost: (): PricingResult | null => {
        if (finalCost) {
          console.log(`📤 [StreamProcessor] Returning final cost: $${finalCost.costUsd}`);
        } else {
          console.warn(`⚠️  [StreamProcessor] No final cost available`);
        }
        return finalCost;
      },

      getUsage: (): UsageInfo | null => {
        return accumulatedUsage;
      }
    };
  }

}
