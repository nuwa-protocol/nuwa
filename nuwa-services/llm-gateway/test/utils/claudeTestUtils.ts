/**
 * Claude Test Utilities
 * Helper functions for testing Claude provider functionality
 */

import { ClaudeProvider } from '../../src/providers/claude.js';
import { UsageInfo, PricingResult } from '../../src/billing/pricing.js';
import { BaseTestValidation, BaseTestResult, ValidationResult } from './baseTestUtils.js';

export interface ClaudeTestOptions {
  model: string;
  max_tokens?: number;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
}

export class ClaudeTestUtils {
  /**
   * Test Claude message completion (non-streaming)
   */
  static async testMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    try {
      const requestData = {
        model: options.model,
        max_tokens: options.max_tokens || 100,
        temperature: options.temperature || 0.7,
        messages: options.messages || [
          { role: 'user', content: 'Hello! Please respond with a brief greeting.' }
        ]
      };

      console.log(`[ClaudeTestUtils] Testing message completion with model: ${options.model}`);
      
      const response = await provider.forwardRequest(
        apiKey,
        '/v1/messages',
        'POST',
        requestData,
        false
      );

      if (!response || 'error' in response) {
        return {
          success: false,
          error: response ? response.error : 'No response received',
          model: options.model
        };
      }

      // Extract usage information
      const usageExtractor = provider.createUsageExtractor();
      const usage = usageExtractor.extractFromResponse(response);
      
      // Calculate cost
      let cost: PricingResult | null = null;
      if (usage) {
        cost = usageExtractor.calculateCost(options.model, usage);
      }

      const parsedResponse = provider.parseResponse(response);

      return {
        success: true,
        response: parsedResponse,
        usage,
        cost,
        model: options.model,
        rawResponse: response
      };
    } catch (error) {
      console.error('[ClaudeTestUtils] Error in testMessageCompletion:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: options.model
      };
    }
  }

  /**
   * Test Claude message completion (streaming)
   */
  static async testStreamingMessageCompletion(
    provider: ClaudeProvider,
    apiKey: string,
    options: ClaudeTestOptions
  ): Promise<BaseTestResult> {
    try {
      const requestData = {
        model: options.model,
        max_tokens: options.max_tokens || 100,
        temperature: options.temperature || 0.7,
        stream: true,
        messages: options.messages || [
          { role: 'user', content: 'Hello! Please respond with a brief greeting.' }
        ]
      };

      console.log(`[ClaudeTestUtils] Testing streaming message completion with model: ${options.model}`);
      
      const response = await provider.forwardRequest(
        apiKey,
        '/v1/messages',
        'POST',
        requestData,
        true
      );

      if (!response || 'error' in response) {
        return {
          success: false,
          error: response ? response.error : 'No response received',
          model: options.model
        };
      }

      // Process streaming response
      const streamProcessor = provider.createStreamProcessor(options.model);
      let accumulatedContent = '';

      return new Promise((resolve) => {
        const stream = response.data;
        
        stream.on('data', (chunk: Buffer) => {
          const chunkText = chunk.toString();
          streamProcessor.processChunk(chunkText);
          
          // Extract content for validation
          const lines = chunkText.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  accumulatedContent += data.delta.text;
                }
              } catch (e) {
                // Ignore parsing errors for non-JSON data lines
              }
            }
          }
        });

        stream.on('end', () => {
          const usage = streamProcessor.getFinalUsage();
          const cost = streamProcessor.getFinalCost();
          const responseBody = streamProcessor.getAccumulatedResponseBody();

          resolve({
            success: true,
            response: {
              content: accumulatedContent,
              ...responseBody
            },
            usage,
            cost,
            model: options.model,
            rawResponse: response
          });
        });

        stream.on('error', (error: Error) => {
          resolve({
            success: false,
            error: error.message,
            model: options.model
          });
        });
      });
    } catch (error) {
      console.error('[ClaudeTestUtils] Error in testStreamingMessageCompletion:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: options.model
      };
    }
  }

  /**
   * Validate Claude test response
   */
  static validateTestResponse(
    result: BaseTestResult,
    validation: BaseTestValidation
  ): ValidationResult {
    const errors: string[] = [];

    // Basic success validation
    if (validation.expectSuccess && !result.success) {
      errors.push(`Expected success but got failure: ${result.error}`);
    }

    if (!validation.expectSuccess && result.success) {
      errors.push('Expected failure but got success');
    }

    // Skip further validation if test failed
    if (!result.success) {
      return { valid: errors.length === 0, errors };
    }

    // Model validation
    if (validation.expectedModel && result.model !== validation.expectedModel) {
      errors.push(`Expected model ${validation.expectedModel} but got ${result.model}`);
    }

    // Usage validation
    if (validation.expectUsage) {
      if (!result.usage) {
        errors.push('Expected usage information but none found');
      } else {
        if (validation.minTokens && result.usage.totalTokens < validation.minTokens) {
          errors.push(`Expected at least ${validation.minTokens} tokens but got ${result.usage.totalTokens}`);
        }
        if (validation.maxTokens && result.usage.totalTokens > validation.maxTokens) {
          errors.push(`Expected at most ${validation.maxTokens} tokens but got ${result.usage.totalTokens}`);
        }
        
        // Validate token consistency
        const expectedTotal = result.usage.promptTokens + result.usage.completionTokens;
        if (result.usage.totalTokens !== expectedTotal) {
          errors.push(`Token count inconsistency: total=${result.usage.totalTokens}, sum=${expectedTotal}`);
        }
      }
    }

    // Cost validation
    if (validation.expectCost) {
      if (!result.cost) {
        errors.push('Expected cost information but none found');
      } else {
        if (result.cost.costUsd <= 0) {
          errors.push(`Expected positive cost but got ${result.cost.costUsd}`);
        }
      }
    }

    // Response validation
    if (validation.expectResponse && !result.response) {
      errors.push('Expected response data but none found');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create test message for Claude API
   */
  static createTestMessage(content: string = 'Hello! Please respond briefly.') {
    return [{ role: 'user', content }];
  }

  /**
   * Get default Claude test options
   */
  static getDefaultOptions(): ClaudeTestOptions {
    return {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 100,
      temperature: 0.7
    };
  }
}
