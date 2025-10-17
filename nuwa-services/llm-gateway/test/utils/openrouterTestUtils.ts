import OpenRouterService from '../../src/services/openrouter.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { OPENROUTER_PATHS } from '../../src/providers/constants.js';

/**
 * OpenRouter-specific test request configurations
 */
export interface OpenRouterChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // OpenRouter-specific parameters
  route?: 'fallback';
  transforms?: string[];
  models?: string[];
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
  };
}

/**
 * OpenRouter-specific test utilities
 */
export class OpenRouterTestUtils extends BaseProviderTestUtils {
  /**
   * Create a standard OpenRouter Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig {
    return {
      model: config.model || 'openai/gpt-3.5-turbo',
      messages: config.messages || [{ role: 'user', content: 'Hello, this is a test message.' }],
      stream: config.stream || false,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 50,
      ...config,
    };
  }

  /**
   * Create an OpenRouter request with routing preferences
   */
  static createChatCompletionWithRoutingRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig {
    return {
      ...this.createChatCompletionRequest(config),
      route: 'fallback',
      models: config.models || ['openai/gpt-3.5-turbo', 'anthropic/claude-3-haiku'],
      provider: {
        order: ['OpenAI', 'Anthropic'],
        allow_fallbacks: true,
        ...config.provider,
      },
    };
  }

  /**
   * Test OpenRouter Chat Completions API
   */
  static async testChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest(config);
      
      const response = await provider.forwardRequest(
        apiKey,
        OPENROUTER_PATHS.CHAT_COMPLETIONS,
        'POST',
        requestData,
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

      // Parse response and extract usage/cost
      const parsedResponse = provider.parseResponse(response);
      const { usage, cost } = await this.extractUsageAndCost(provider, response, requestData);

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
   * Test OpenRouter streaming Chat Completions
   */
  static async testStreamingChatCompletion(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest({ ...config, stream: true });
      
      const response = await provider.forwardRequest(
        apiKey,
        OPENROUTER_PATHS.CHAT_COMPLETIONS,
        'POST',
        requestData,
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
        let usage: any;
        let cost: any;
        let streamProcessor: any;

        // Create stream processor
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
   * Test OpenRouter with routing preferences
   */
  static async testChatCompletionWithRouting(
    provider: OpenRouterService,
    apiKey: string | null,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const routingConfig = this.createChatCompletionWithRoutingRequest(config);
    return this.testChatCompletion(provider, apiKey, routingConfig);
  }

  /**
   * Test OpenRouter with HTTP Referer header (required for some features)
   */
  static async testChatCompletionWithReferer(
    provider: OpenRouterService,
    apiKey: string | null,
    referer: string,
    config: Partial<OpenRouterChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    // This would require modifying the provider to accept custom headers
    // For now, we'll use the standard test but note the limitation
    console.warn('⚠️  HTTP Referer header testing requires provider modification');
    return this.testChatCompletion(provider, apiKey, config);
  }

  /**
   * Get common OpenRouter model names for testing
   */
  static getCommonModels(): string[] {
    return [
      'openai/gpt-3.5-turbo',
      'openai/gpt-4',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-sonnet',
      'meta-llama/llama-2-70b-chat',
    ];
  }

  /**
   * Create a request for testing different model providers
   */
  static createMultiProviderTestRequest(config: Partial<OpenRouterChatCompletionConfig> = {}): OpenRouterChatCompletionConfig[] {
    const models = this.getCommonModels();
    return models.map(model => this.createChatCompletionRequest({ ...config, model }));
  }
}
