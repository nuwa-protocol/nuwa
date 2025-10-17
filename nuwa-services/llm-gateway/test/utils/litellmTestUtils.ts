import LiteLLMService from '../../src/services/litellm.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { LITELLM_PATHS } from '../../src/providers/constants.js';

/**
 * LiteLLM-specific test request configurations
 */
export interface LiteLLMChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  // LiteLLM-specific parameters
  user?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  api_base?: string;
  api_version?: string;
}

/**
 * LiteLLM-specific test utilities
 */
export class LiteLLMTestUtils extends BaseProviderTestUtils {
  /**
   * Create a standard LiteLLM Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig {
    return {
      model: config.model || 'gpt-3.5-turbo',
      messages: config.messages || [{ role: 'user', content: 'Hello, this is a test message.' }],
      stream: config.stream || false,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 50,
      ...config,
    };
  }

  /**
   * Create a LiteLLM request with metadata and tags
   */
  static createChatCompletionWithMetadataRequest(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig {
    return {
      ...this.createChatCompletionRequest(config),
      user: config.user || 'test-user',
      metadata: {
        test_run: true,
        environment: 'integration-test',
        ...config.metadata,
      },
      tags: config.tags || ['test', 'integration'],
    };
  }

  /**
   * Test LiteLLM Chat Completions API
   */
  static async testChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest(config);
      
      const response = await provider.forwardRequest(
        apiKey,
        LITELLM_PATHS.CHAT_COMPLETIONS,
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
   * Test LiteLLM streaming Chat Completions
   */
  static async testStreamingChatCompletion(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest({ ...config, stream: true });
      
      const response = await provider.forwardRequest(
        apiKey,
        LITELLM_PATHS.CHAT_COMPLETIONS,
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
   * Test LiteLLM with metadata and tags
   */
  static async testChatCompletionWithMetadata(
    provider: LiteLLMService,
    apiKey: string | null,
    config: Partial<LiteLLMChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const metadataConfig = this.createChatCompletionWithMetadataRequest(config);
    return this.testChatCompletion(provider, apiKey, metadataConfig);
  }

  /**
   * Get common LiteLLM model names for testing
   */
  static getCommonModels(): string[] {
    return [
      'gpt-3.5-turbo',
      'gpt-4',
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'gemini-pro',
    ];
  }

  /**
   * Create requests for testing different models through LiteLLM
   */
  static createMultiModelTestRequests(config: Partial<LiteLLMChatCompletionConfig> = {}): LiteLLMChatCompletionConfig[] {
    const models = this.getCommonModels();
    return models.map(model => this.createChatCompletionRequest({ ...config, model }));
  }

  /**
   * Test LiteLLM health endpoint
   */
  static async testHealth(
    provider: LiteLLMService,
    apiKey: string | null
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const response = await provider.forwardRequest(apiKey, '/health', 'GET', undefined, false);
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
}
