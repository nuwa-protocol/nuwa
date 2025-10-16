import { Request, Response } from 'express';
import { pricingRegistry, UsageInfo, PricingResult } from './pricing.js';
import { calculateToolCallCost, hasToolTokenDiscount, validateTools } from '../config/toolPricing.js';
import { ToolCallCounts, ToolValidationResult, ResponseUsage, ExtendedUsage } from '../types/index.js';

/**
 * Usage policy for handling token-based billing
 * Extracts usage from responses and calculates costs when needed
 */
export class UsagePolicy {
  /**
   * Global pricing multiplier helpers
   */
  private static cachedMultiplier: number | null = null;

  /**
   * Read and cache PRICING_MULTIPLIER from env; clamp to [0, 100]
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
  private static applyMultiplier(costUsd: number | undefined): number | undefined {
    if (typeof costUsd !== 'number') return costUsd;
    const m = this.getPricingMultiplier();
    // Avoid tiny negative zeros
    const result = costUsd * m;
    return result;
  }
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
    const baseInputTokens = usage.input_tokens || 0;
    const baseOutputTokens = usage.output_tokens || 0;
    
    // Extract tool-related tokens dynamically
    let toolTokens = 0;
    const keys = Object.keys(usage);
    
    for (const key of keys) {
      // Match all *_tokens fields except the standard ones
      if (key.endsWith('_tokens') && 
          key !== 'input_tokens' && 
          key !== 'output_tokens' && 
          key !== 'total_tokens') {
        const tokenValue = usage[key];
        if (typeof tokenValue === 'number' && tokenValue > 0) {
          toolTokens += tokenValue;
          console.log(`📊 [extractResponseAPIUsage] Found tool tokens: ${key} = ${tokenValue}`);
        }
      }
    }
    
    // Tool tokens are typically added to input tokens
    const promptTokens = baseInputTokens + toolTokens;
    const completionTokens = baseOutputTokens;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    
    // Log detailed token breakdown if we have details
    if (usage.input_tokens_details || usage.output_tokens_details) {
      console.log('📊 [extractResponseAPIUsage] Token details:', {
        input_tokens_details: usage.input_tokens_details,
        output_tokens_details: usage.output_tokens_details,
        tool_tokens: toolTokens
      });
    }
    
    return {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
    };
  }

  /**
   * Parse tool calls from Response API output array
   * Returns a count of each tool type used
   */
  static parseToolCallsFromOutput(responseBody: any): ToolCallCounts {
    const toolCalls: { [toolName: string]: number } = {};
    
    try {
      // Check if response has output array
      if (!responseBody?.output || !Array.isArray(responseBody.output)) {
        return toolCalls;
      }

      console.log('🔧 [parseToolCallsFromOutput] Parsing output array with', responseBody.output.length, 'items');

      // Count tool calls by type
      for (const outputItem of responseBody.output) {
        if (outputItem?.type && typeof outputItem.type === 'string') {
          // Match tool call patterns: web_search_call, file_search_call, etc.
          if (outputItem.type.endsWith('_call')) {
            const toolType = outputItem.type.replace('_call', '');
            toolCalls[toolType] = (toolCalls[toolType] || 0) + 1;
            console.log(`🔧 [parseToolCallsFromOutput] Found ${toolType} call (id: ${outputItem.id})`);
          }
        }
      }

      console.log('🔧 [parseToolCallsFromOutput] Tool call summary:', toolCalls);
      return toolCalls;
    } catch (error) {
      console.error('❌ [parseToolCallsFromOutput] Error parsing tool calls:', error);
      return toolCalls;
    }
  }

  /**
   * Validate tools in request before processing
   */
  static validateRequestTools(requestData: any): { valid: boolean; error?: string } {
    try {
      if (!requestData?.tools) {
        return { valid: true }; // No tools to validate
      }

      const validation: ToolValidationResult = validateTools(requestData.tools);
      if (!validation.valid) {
        const error = `Unsupported tools: ${validation.unsupportedTools.join(', ')}. Only supported tools: web_search, file_search, code_interpreter, computer_use`;
        console.warn('⚠️ [validateRequestTools]', error);
        return { valid: false, error };
      }

      console.log('✅ [validateRequestTools] All tools are supported');
      return { valid: true };
    } catch (error) {
      console.error('❌ [validateRequestTools] Error validating tools:', error);
      return { valid: false, error: 'Tool validation failed' };
    }
  }

  /**
   * Calculate comprehensive cost for Response API including tool calls
   * Now supports parsing tool calls from response body
   */
  static calculateResponseAPICost(
    model: string,
    usage: any,
    responseBody?: any,
    providerCostUsd?: number
  ): PricingResult | null {
    // If provider already calculated total cost, use it
    if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
      const usageInfo = this.extractUsageFromResponse({ usage });
      return {
        costUsd: this.applyMultiplier(providerCostUsd)!,
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

    // 2. Calculate tool call costs from output array (new approach)
    let toolCallCost = 0;
    if (responseBody) {
      const toolCalls = this.parseToolCallsFromOutput(responseBody);
      for (const [toolName, callCount] of Object.entries(toolCalls)) {
        if (callCount > 0) {
          const cost = calculateToolCallCost(toolName, callCount);
          toolCallCost += cost;
          console.log(`💰 [calculateResponseAPICost] ${toolName}: ${callCount} calls = $${cost.toFixed(6)}`);
        }
      }
    }

    // 3. Fallback: Calculate tool call costs from usage.tool_calls_count (legacy)
    if (toolCallCost === 0 && usage.tool_calls_count) {
      console.log('📊 [calculateResponseAPICost] Using legacy tool_calls_count from usage');
      for (const [toolName, callCount] of Object.entries(usage.tool_calls_count)) {
        if (typeof callCount === 'number' && callCount > 0) {
          const cost = calculateToolCallCost(toolName, callCount);
          toolCallCost += cost;
        }
      }
    }

    // 4. Total cost
    const totalCost = modelCost + toolCallCost;

    console.log(`💰 [calculateResponseAPICost] Cost breakdown - Model: $${modelCost.toFixed(6)}, Tools: $${toolCallCost.toFixed(6)}, Total: $${totalCost.toFixed(6)}`);

    return {
      costUsd: this.applyMultiplier(totalCost)!,
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
        costUsd: this.applyMultiplier(providerCostUsd)!,
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
        return {
          ...result,
          costUsd: this.applyMultiplier(result.costUsd)!,
        };
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
   * Now supports tool call cost calculation
   */
  static processNonStreamResponse(
    model: string,
    responseBody: any,
    providerCostUsd?: number
  ): PricingResult | null {
    // Check if this is a Response API response (has output array)
    if (responseBody?.output && Array.isArray(responseBody.output)) {
      console.log('🔧 [processNonStreamResponse] Processing Response API response with tools');
      return this.calculateResponseAPICost(model, responseBody.usage, responseBody, providerCostUsd);
    }

    // Fallback to standard processing for Chat Completions API
    console.log('📊 [processNonStreamResponse] Processing Chat Completions API response');
    const usage = this.extractUsageFromResponse(responseBody);
    return this.calculateRequestCost(model, providerCostUsd, usage || undefined);
  }

  /**
   * Create a stream processor for billing
   * Returns a function that processes chunks and returns final cost
   * Now supports tool call counting from stream
   */
  static createStreamProcessor(model: string, providerCostUsd?: number) {
    let accumulatedUsage: UsageInfo | null = null;
    let extractedCost: number | undefined = undefined;
    let finalCost: PricingResult | null = null;
    let accumulatedResponseBody: any = null; // Store final response for tool parsing

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

        // Try to extract complete response body for tool parsing
        this.tryExtractResponseBody(chunkText, (responseBody) => {
          accumulatedResponseBody = responseBody;
          console.log('🔧 [StreamProcessor] Captured complete response body for tool parsing');
        });
      },
      
      getFinalCost: (): PricingResult | null => {
        // If we have accumulated response body, recalculate with tool costs
        if (finalCost && accumulatedResponseBody && accumulatedUsage) {
          console.log('🔧 [StreamProcessor] Recalculating cost with tool calls from response body');
          const enhancedCost = this.calculateResponseAPICost(
            model,
            { usage: accumulatedUsage },
            accumulatedResponseBody,
            extractedCost !== undefined ? extractedCost : providerCostUsd
          );
          
          if (enhancedCost) {
            console.log(`📤 [StreamProcessor] Returning enhanced cost with tools: $${enhancedCost.costUsd}`);
            return enhancedCost;
          }
        }

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

  /**
   * Try to extract complete response body from stream chunk
   * Calls callback when complete response is found
   */
  private static tryExtractResponseBody(chunkText: string, callback: (responseBody: any) => void): void {
    try {
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Look for response.completed event with full response
        if (trimmed.startsWith('event: response.completed')) {
          const nextLineIndex = lines.indexOf(line) + 1;
          if (nextLineIndex < lines.length) {
            const dataLine = lines[nextLineIndex].trim();
            if (dataLine.startsWith('data: ')) {
              const dataStr = dataLine.slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.response) {
                  callback(data.response);
                  return;
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors in stream parsing
    }
  }

}
