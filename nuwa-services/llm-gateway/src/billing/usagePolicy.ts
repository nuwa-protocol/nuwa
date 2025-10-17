import { Request, Response } from 'express';
import { pricingRegistry, UsageInfo, PricingResult } from './pricing.js';
import { calculateToolCallCost, hasToolTokenDiscount, validateTools } from '../config/toolPricing.js';
import { ToolCallCounts, ToolValidationResult, ResponseUsage, ExtendedUsage } from '../types/index.js';
import { UsagePolicyAdapter } from './usage/UsagePolicyAdapter.js';
import { CostCalculator } from './usage/CostCalculator.js';

/**
 * Usage policy for handling token-based billing
 * Extracts usage from responses and calculates costs when needed
 */
export class UsagePolicy {
  /**
   * Read and cache PRICING_MULTIPLIER from env; clamp to [0, 100]
   * Delegated to UsagePolicyAdapter for consistency
   */
  static getPricingMultiplier(): number {
    return UsagePolicyAdapter.getPricingMultiplier();
  }

  /**
   * Extract usage information from non-streaming response
   * Supports both Chat Completions and Response API formats
   * Delegated to UsagePolicyAdapter for provider-specific handling
   */
  static extractUsageFromResponse(responseBody: any, providerName?: string): UsageInfo | null {
    return UsagePolicyAdapter.extractUsageFromResponse(responseBody, providerName);
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
        costUsd: CostCalculator.applyMultiplier(providerCostUsd)!,
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
      costUsd: CostCalculator.applyMultiplier(totalCost)!,
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
   * Delegated to UsagePolicyAdapter for provider-specific handling
   */
  static extractUsageFromStreamChunk(chunkText: string, providerName?: string): { usage: UsageInfo; cost?: number } | null {
    return UsagePolicyAdapter.extractUsageFromStreamChunk(chunkText, providerName);
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
   * Delegated to UsagePolicyAdapter for consistency
   */
  static injectStreamUsageOption(requestData: any): any {
    return UsagePolicyAdapter.injectStreamUsageOption(requestData);
  }

  /**
   * Calculate cost for a request, preferring provider cost over gateway pricing
   * Delegated to UsagePolicyAdapter for enhanced functionality
   */
  static calculateRequestCost(
    model: string,
    providerCostUsd?: number,
    usage?: UsageInfo
  ): PricingResult | null {
    return UsagePolicyAdapter.calculateRequestCost(model, providerCostUsd, usage);
  }

  /**
   * Set usage cost in response locals for PaymentKit billing
   * Delegated to UsagePolicyAdapter for consistency
   */
  static setResponseUsage(res: Response, costUsd: number, source: string): void {
    UsagePolicyAdapter.setResponseUsage(res, costUsd, source);
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
   * Delegated to UsagePolicyAdapter for provider-specific handling
   */
  static createStreamProcessor(model: string, providerCostUsd?: number, providerName?: string) {
    return UsagePolicyAdapter.createStreamProcessor(model, providerCostUsd, providerName);
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
