import { LLMProvider } from '../../src/providers/LLMProvider.js';
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
      }

      // Check cost information
      if (validation.expectCost && !result.cost) {
        errors.push('Expected cost information but none found');
      }

      // Check model
      if (validation.expectedModel && result.cost?.model !== validation.expectedModel) {
        errors.push(`Expected model ${validation.expectedModel} but got ${result.cost?.model}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a mock response object for testing
   */
  static createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      write: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      locals: {},
      headersSent: false,
    } as any;

    return res;
  }

  /**
   * Wait for a specified amount of time (useful for rate limiting in tests)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      usage = extractor.extractFromResponseBody(parsedResponse);
      
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
          cost = extractor.calculateCost(requestData.model, usage);
        }
      }
    }

    return { usage, cost };
  }
}
