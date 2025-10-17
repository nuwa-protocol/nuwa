import { LLMProvider } from '../../src/providers/LLMProvider.js';
import { ProviderManager } from '../../src/core/providerManager.js';
import { RouteHandler } from '../../src/core/routeHandler.js';
import { AuthManager } from '../../src/core/authManager.js';
import { TestEnv } from './testEnv.js';
import { UsageInfo, PricingResult } from '../../src/billing/pricing.js';
import { OPENAI_PATHS, OPENROUTER_PATHS, LITELLM_PATHS } from '../../src/providers/constants.js';

/**
 * Test request configuration
 */
export interface TestRequestConfig {
  model: string;
  messages?: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

/**
 * Test response validation
 */
export interface TestResponseValidation {
  expectSuccess: boolean;
  expectUsage?: boolean;
  expectCost?: boolean;
  minTokens?: number;
  maxTokens?: number;
  expectedModel?: string;
}

/**
 * Provider test result
 */
export interface ProviderTestResult {
  success: boolean;
  response?: any;
  usage?: UsageInfo;
  cost?: PricingResult;
  error?: string;
  duration?: number;
  statusCode?: number;
}

/**
 * Utilities for testing providers in isolation and integration
 * 
 * @deprecated This class is being phased out in favor of provider-specific test utilities.
 * For new tests, use:
 * - OpenAITestUtils for OpenAI provider tests
 * - OpenRouterTestUtils for OpenRouter provider tests  
 * - LiteLLMTestUtils for LiteLLM provider tests
 * 
 * Some utility methods like createTestProviderManager are still useful and may be moved to BaseTestUtils.
 */
export class ProviderTestUtils {
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
   * Test a provider with a simple chat completion request
   */
  static async testProviderChatCompletion(
    provider: LLMProvider,
    apiKey: string | null,
    config: TestRequestConfig = { model: 'gpt-3.5-turbo' }
  ): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = {
        model: config.model,
        messages: config.messages || [{ role: 'user', content: 'Hello, how are you?' }],
        stream: config.stream || false,
        temperature: config.temperature || 0.7,
        max_tokens: config.max_tokens || 100,
        ...config,
      };

      // Prepare request data if provider supports it
      let finalRequestData = requestData;
      if (provider.prepareRequestData) {
        finalRequestData = provider.prepareRequestData(requestData, requestData.stream);
      }

      // Determine the correct API path based on provider and request data
      let apiPath = OPENAI_PATHS.CHAT_COMPLETIONS; // Default to chat completions
      
      // For OpenAI, check if this is a Response API request (has 'input' field)
      if (finalRequestData && finalRequestData.input && provider.SUPPORTED_PATHS.includes(OPENAI_PATHS.RESPONSES)) {
        apiPath = OPENAI_PATHS.RESPONSES;
      }
      
      const response = await provider.forwardRequest(
        apiKey,
        apiPath,
        'POST',
        finalRequestData,
        requestData.stream
      );

      const duration = Date.now() - startTime;

      if (!response) {
        return {
          success: false,
          error: 'No response received',
          duration,
        };
      }

      if ('error' in response) {
        return {
          success: false,
          error: response.error,
          statusCode: response.status,
          duration,
        };
      }

      // Parse response
      const parsedResponse = provider.parseResponse(response);
      
      // Extract usage information
      let usage: UsageInfo | undefined;
      let cost: PricingResult | undefined;
      
      if (provider.createUsageExtractor) {
        const extractor = provider.createUsageExtractor();
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

      return {
        success: true,
        response: parsedResponse,
        usage,
        cost,
        duration,
        statusCode: response.status,
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
   * Test a provider with a streaming chat completion request
   */
  static async testProviderStreamingChatCompletion(
    provider: LLMProvider,
    apiKey: string | null,
    config: TestRequestConfig = { model: 'gpt-3.5-turbo' }
  ): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = {
        model: config.model,
        messages: config.messages || [{ role: 'user', content: 'Hello, how are you?' }],
        stream: true,
        temperature: config.temperature || 0.7,
        max_tokens: config.max_tokens || 100,
        ...config,
      };

      // Prepare request data if provider supports it
      let finalRequestData = requestData;
      if (provider.prepareRequestData) {
        finalRequestData = provider.prepareRequestData(requestData, true);
      }

      // Determine the correct API path based on provider and request data
      let apiPath = OPENAI_PATHS.CHAT_COMPLETIONS; // Default to chat completions
      
      // For OpenAI, check if this is a Response API request (has 'input' field)
      if (finalRequestData && finalRequestData.input && provider.SUPPORTED_PATHS.includes(OPENAI_PATHS.RESPONSES)) {
        apiPath = OPENAI_PATHS.RESPONSES;
      }
      
      const response = await provider.forwardRequest(
        apiKey,
        apiPath,
        'POST',
        finalRequestData,
        true
      );

      const duration = Date.now() - startTime;

      if (!response) {
        return {
          success: false,
          error: 'No response received',
          duration,
        };
      }

      if ('error' in response) {
        return {
          success: false,
          error: response.error,
          statusCode: response.status,
          duration,
        };
      }

      // Process streaming response
      return new Promise((resolve) => {
        let accumulatedContent = '';
        let usage: UsageInfo | undefined;
        let cost: PricingResult | undefined;
        let streamProcessor: any;

        // Create stream processor if provider supports it
        if (provider.createStreamProcessor) {
          streamProcessor = provider.createStreamProcessor(requestData.model);
        }

        response.data.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          accumulatedContent += chunkStr;
          
          if (streamProcessor) {
            streamProcessor.processChunk(chunkStr);
          }
        });

        response.data.on('end', () => {
          if (streamProcessor) {
            usage = streamProcessor.getFinalUsage();
            cost = streamProcessor.getFinalCost();
          }

          resolve({
            success: true,
            response: { content: accumulatedContent },
            usage,
            cost,
            duration: Date.now() - startTime,
            statusCode: 200,
          });
        });

        response.data.on('error', (error: Error) => {
          resolve({
            success: false,
            error: error.message,
            duration: Date.now() - startTime,
          });
        });
      });

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Test provider models endpoint
   */
  static async testProviderModels(
    provider: LLMProvider,
    apiKey: string | null,
    path: string = '/v1/models'
  ): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await provider.forwardRequest(apiKey, path, 'GET', undefined, false);
      const duration = Date.now() - startTime;

      if (!response) {
        return {
          success: false,
          error: 'No response received',
          duration,
        };
      }

      if ('error' in response) {
        return {
          success: false,
          error: response.error,
          statusCode: response.status,
          duration,
        };
      }

      const parsedResponse = provider.parseResponse(response);

      return {
        success: true,
        response: parsedResponse,
        duration,
        statusCode: response.status,
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
   * Validate test response against expected criteria
   */
  static validateTestResponse(
    result: ProviderTestResult,
    validation: TestResponseValidation
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
   * Create a mock request object for testing
   */
  static createMockRequest(config: TestRequestConfig & { path?: string; method?: string }) {
    return {
      path: config.path || '/v1/chat/completions',
      method: config.method || 'POST',
      body: {
        model: config.model,
        messages: config.messages || [{ role: 'user', content: 'Hello' }],
        stream: config.stream || false,
        temperature: config.temperature || 0.7,
        max_tokens: config.max_tokens || 100,
        ...config,
      },
    } as any;
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
   * Get test configuration for a specific provider
   */
  static getProviderTestConfig(providerName: string): TestRequestConfig {
    const baseConfig: TestRequestConfig = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
      temperature: 0.7,
      max_tokens: 50,
    };

    switch (providerName) {
      case 'openai':
        return {
          ...baseConfig,
          model: 'gpt-3.5-turbo',
        };
      
      case 'openrouter':
        return {
          ...baseConfig,
          model: 'openai/gpt-3.5-turbo',
        };
      
      case 'litellm':
        return {
          ...baseConfig,
          model: 'gpt-3.5-turbo',
        };
      
      default:
        return baseConfig;
    }
  }
}
