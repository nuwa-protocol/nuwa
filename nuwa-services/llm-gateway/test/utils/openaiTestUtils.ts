import { OpenAIProvider } from '../../src/providers/openai.js';
import { BaseProviderTestUtils, BaseTestResult } from './baseTestUtils.js';
import { OPENAI_PATHS } from '../../src/providers/constants.js';

/**
 * OpenAI-specific test request configurations
 */
export interface OpenAIChatCompletionConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
}

export interface OpenAIResponseAPIConfig {
  model: string;
  input: string | Array<{ role: string; content: string }>;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    name: string;
    description: string;
    parameters: any;
  }>;
  max_output_tokens?: number;
}

/**
 * OpenAI-specific test utilities
 */
export class OpenAITestUtils extends BaseProviderTestUtils {
  /**
   * Create a standard Chat Completions request
   */
  static createChatCompletionRequest(config: Partial<OpenAIChatCompletionConfig> = {}): OpenAIChatCompletionConfig {
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
   * Create a Response API request
   */
  static createResponseAPIRequest(config: Partial<OpenAIResponseAPIConfig> = {}): OpenAIResponseAPIConfig {
    return {
      model: config.model || 'gpt-4o-mini',
      input: config.input || 'Hello, this is a test message for Response API.',
      stream: config.stream || false,
      max_output_tokens: config.max_output_tokens || 50,
      ...config,
    };
  }

  /**
   * Create a Chat Completions request with function tools
   */
  static createChatCompletionWithToolsRequest(config: Partial<OpenAIChatCompletionConfig> = {}): OpenAIChatCompletionConfig {
    const defaultTools = [{
      type: 'function' as const,
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            }
          },
          required: ['location']
        }
      }
    }];

    return {
      ...this.createChatCompletionRequest(config),
      tools: config.tools || defaultTools,
    };
  }

  /**
   * Create a Response API request with function tools
   */
  static createResponseAPIWithToolsRequest(config: Partial<OpenAIResponseAPIConfig> = {}): OpenAIResponseAPIConfig {
    const defaultTools = [{
      type: 'function' as const,
      name: 'get_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA'
          }
        },
        required: ['location']
      }
    }];

    return {
      ...this.createResponseAPIRequest(config),
      tools: config.tools || defaultTools,
    };
  }

  /**
   * Test OpenAI Chat Completions API
   */
  static async testChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest(config);
      
      const response = await provider.forwardRequest(
        apiKey,
        OPENAI_PATHS.CHAT_COMPLETIONS,
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
   * Test OpenAI Response API
   */
  static async testResponseAPI(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIResponseAPIConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createResponseAPIRequest(config);
      
      const response = await provider.forwardRequest(
        apiKey,
        OPENAI_PATHS.RESPONSES,
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
   * Test OpenAI streaming Chat Completions
   */
  static async testStreamingChatCompletion(
    provider: OpenAIProvider,
    apiKey: string | null,
    config: Partial<OpenAIChatCompletionConfig> = {}
  ): Promise<BaseTestResult> {
    const startTime = Date.now();
    
    try {
      const requestData = this.createChatCompletionRequest({ ...config, stream: true });
      
      const response = await provider.forwardRequest(
        apiKey,
        OPENAI_PATHS.CHAT_COMPLETIONS,
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

}
