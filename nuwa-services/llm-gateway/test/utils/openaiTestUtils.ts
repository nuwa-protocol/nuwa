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
      const duration = Date.now() - startTime;

      // Use the new high-level executeRequest API
      const executeResult = await provider.executeRequest(
        apiKey,
        OPENAI_PATHS.CHAT_COMPLETIONS,
        'POST',
        requestData
      );

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
      const duration = Date.now() - startTime;

      // Use the new high-level executeRequest API
      const executeResult = await provider.executeRequest(
        apiKey,
        OPENAI_PATHS.RESPONSES,
        'POST',
        requestData
      );

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
      
      // Use PassThrough stream to capture content for testing
      const { PassThrough } = await import('stream');
      const captureStream = new PassThrough();
      let accumulatedContent = '';

      // Capture content as it flows through
      captureStream.on('data', (chunk: Buffer) => {
        accumulatedContent += chunk.toString();
      });

      // Use the new high-level executeStreamRequest API
      const result = await provider.executeStreamRequest(
        apiKey,
        OPENAI_PATHS.CHAT_COMPLETIONS,
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
