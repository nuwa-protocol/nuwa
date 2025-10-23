import { LLMProvider, TestableLLMProvider } from '../../src/providers/LLMProvider.js';
import { ProviderManager } from '../../src/core/providerManager.js';
import { RouteHandler } from '../../src/core/routeHandler.js';
import { AuthManager } from '../../src/core/authManager.js';
import { UsageInfo, PricingResult } from '../../src/billing/pricing.js';

/**
 * Base test result interface
 */
export interface BaseTestResult {
  success: boolean;
  response?: any;
  usage?: UsageInfo;
  cost?: PricingResult;
  error?: string;
  duration?: number;
  statusCode?: number;
  model?: string;
  rawResponse?: any;
}

/**
 * Base test response validation
 */
export interface BaseTestValidation {
  expectSuccess: boolean;
  expectUsage?: boolean;
  expectCost?: boolean;
  expectResponse?: boolean;
  minTokens?: number;
  maxTokens?: number;
  expectedModel?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Base utilities for provider testing
 */
export abstract class BaseProviderTestUtils {
  /**
   * Create a test provider manager with only specified providers
   */
  static createTestProviderManager(enabledProviders: string[] = []): ProviderManager {
    const manager = ProviderManager.createTestInstance();
    
    // Initialize with skip env check to avoid requiring real API keys for unit tests
    const result = manager.initializeProviders({ skipEnvCheck: true });
    
    // If specific providers are requested, filter to only those
    if (enabledProviders.length > 0) {
      const allProviders = manager.list();
      allProviders.forEach(providerName => {
        if (!enabledProviders.includes(providerName)) {
          manager.unregister(providerName);
        }
      });
    }
    
    return manager;
  }

  /**
   * Create a test route handler for isolated testing
   */
  static createTestRouteHandler(options: {
    enabledProviders?: string[];
    skipAuth?: boolean;
  } = {}): RouteHandler {
    const providerManager = this.createTestProviderManager(options.enabledProviders);
    const authManager = AuthManager.createTestInstance();
    
    return RouteHandler.createTestInstance({
      providerManager,
      authManager,
      skipAuth: options.skipAuth ?? true,
    });
  }

  /**
   * Validate test response against expected criteria
   */
  static validateTestResponse(
    result: BaseTestResult,
    validation: BaseTestValidation
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check success expectation
    if (validation.expectSuccess && !result.success) {
      errors.push(`Expected success but got error: ${result.error}`);
    } else if (!validation.expectSuccess && result.success) {
      errors.push('Expected failure but got success');
    }

    // If expecting success, validate response content
    if (validation.expectSuccess && result.success) {
      // Check usage information
      if (validation.expectUsage && !result.usage) {
        errors.push('Expected usage information but none found');
      }

      if (result.usage) {
        if (validation.minTokens && (result.usage.totalTokens || 0) < validation.minTokens) {
          errors.push(`Expected at least ${validation.minTokens} tokens but got ${result.usage.totalTokens}`);
        }

        if (validation.maxTokens && (result.usage.totalTokens || 0) > validation.maxTokens) {
          errors.push(`Expected at most ${validation.maxTokens} tokens but got ${result.usage.totalTokens}`);
        }

        // Validate token consistency (integrated from Claude test utils)
        if (result.usage.promptTokens && result.usage.completionTokens && result.usage.totalTokens) {
          const expectedTotal = result.usage.promptTokens + result.usage.completionTokens;
          if (result.usage.totalTokens !== expectedTotal) {
            errors.push(`Token count inconsistency: total=${result.usage.totalTokens}, sum=${expectedTotal}`);
          }
        }
      }

      // Check cost information
      if (validation.expectCost && !result.cost) {
        errors.push('Expected cost information but none found');
      }

      if (result.cost && result.cost.costUsd <= 0) {
        errors.push(`Expected positive cost but got ${result.cost.costUsd}`);
      }

      // Check model
      if (validation.expectedModel && result.cost?.model !== validation.expectedModel) {
        errors.push(`Expected model ${validation.expectedModel} but got ${result.cost?.model}`);
      }

      // Check response
      if (validation.expectResponse && !result.response) {
        errors.push('Expected response data but none found');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a mock response object for testing
   * Note: This method is kept for backward compatibility but requires jest to be available
   */
  static createMockResponse() {
    // Check if jest is available (for unit tests)
    if (typeof (globalThis as any).jest !== 'undefined') {
      const jestGlobal = (globalThis as any).jest;
      const res = {
        status: jestGlobal.fn().mockReturnThis(),
        json: jestGlobal.fn().mockReturnThis(),
        setHeader: jestGlobal.fn().mockReturnThis(),
        write: jestGlobal.fn().mockReturnThis(),
        end: jestGlobal.fn().mockReturnThis(),
        locals: {},
        headersSent: false,
      } as any;

      return res;
    }
    
    // Fallback for non-jest environments
    return {
      status: () => ({ json: () => {}, setHeader: () => {}, write: () => {}, end: () => {} }),
      json: () => {},
      setHeader: () => {},
      write: () => {},
      end: () => {},
      locals: {},
      headersSent: false,
    } as any;
  }

  /**
   * Wait for a specified amount of time (useful for rate limiting in tests)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generic test method for non-streaming requests
   * Works with any provider that implements TestableLLMProvider
   * @param provider Provider instance that implements TestableLLMProvider
   * @param apiKey API key for the provider
   * @param endpoint API endpoint to test
   * @param options Optional configuration to override defaults
   * @returns Test result with usage and cost information
   */
  static async testNonStreamingRequest(
    provider: TestableLLMProvider,
    apiKey: string | null,
    endpoint: string,
    options?: Record<string, any>
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      // Use provider's method to create properly formatted request
      const requestData = provider.createTestRequest(endpoint, options);
      
      // Use the high-level executeRequest API
      const executeResult = await provider.executeRequest(
        apiKey,
        endpoint,
        'POST',
        requestData
      );

      const duration = Date.now() - startTime;

      if (!executeResult.success) {
        return {
          success: false,
          error: executeResult.error || 'Unknown error',
          duration,
          statusCode: executeResult.statusCode,
        };
      }

      return {
        success: true,
        response: executeResult.response,
        usage: executeResult.usage,
        cost: executeResult.cost,
        duration,
        statusCode: executeResult.statusCode,
        model: requestData.model,
        rawResponse: executeResult.rawResponse,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Generic test method for streaming requests
   * Works with any provider that implements TestableLLMProvider
   * @param provider Provider instance that implements TestableLLMProvider
   * @param apiKey API key for the provider
   * @param endpoint API endpoint to test
   * @param options Optional configuration to override defaults
   * @returns Test result with accumulated content, usage and cost information
   */
  static async testStreamingRequest(
    provider: TestableLLMProvider,
    apiKey: string | null,
    endpoint: string,
    options?: Record<string, any>
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      // Use provider's method to create properly formatted streaming request
      const requestData = provider.createTestRequest(endpoint, { ...options, stream: true });
      
      // Use PassThrough stream to capture content for testing
      const { PassThrough } = await import('stream');
      const captureStream = new PassThrough();
      let accumulatedContent = '';

      // Capture content as it flows through
      captureStream.on('data', (chunk: Buffer) => {
        accumulatedContent += chunk.toString();
      });

      // Use the high-level executeStreamRequest API
      const result = await provider.executeStreamRequest(
        apiKey,
        endpoint,
        'POST',
        requestData,
        captureStream  // Pass the capture stream as destination
      );

      const duration = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error',
          duration,
          statusCode: result.statusCode,
        };
      }

      return {
        success: true,
        response: { content: accumulatedContent },
        usage: result.usage,
        cost: result.cost,
        duration,
        statusCode: result.statusCode,
        model: requestData.model,
        rawResponse: result.rawResponse,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract usage and cost from provider response
   */
  protected static async extractUsageAndCost(
    provider: LLMProvider,
    response: any,
    requestData: any
  ): Promise<{ usage?: UsageInfo; cost?: PricingResult }> {
    let usage: UsageInfo | undefined;
    let cost: PricingResult | undefined;
    
    if (provider.createUsageExtractor) {
      const extractor = provider.createUsageExtractor();
      const parsedResponse = provider.parseResponse(response);
      const extractedUsage = extractor.extractFromResponseBody(parsedResponse);
      usage = extractedUsage || undefined;
      
      if (usage) {
        // Extract provider cost if available
        let providerCost: number | undefined;
        if (provider.extractProviderUsageUsd) {
          providerCost = provider.extractProviderUsageUsd(response);
        }
        
        // Calculate cost with provider cost preference
        if (providerCost !== undefined) {
          cost = {
            costUsd: providerCost,
            source: 'provider' as const,
            model: requestData.model,
            usage
          };
        } else {
          const calculatedCost = extractor.calculateCost(requestData.model, usage);
          cost = calculatedCost || undefined;
        }
      }
    }

    return { usage, cost };
  }
}
