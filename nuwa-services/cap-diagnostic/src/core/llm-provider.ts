import type { LanguageModelV1 } from '@ai-sdk/provider';
import { createOpenRouter } from './openrouter-provider.js';
import type { DiagnosticConfig } from '../types/diagnostic.js';
import { logger } from '../utils/logger.js';

export interface LLMProviderSettings {
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  fetch?: typeof fetch;
}

export class LLMProvider {
  private openrouter: any;
  private config: DiagnosticConfig['llm'];

  constructor(config: DiagnosticConfig['llm']) {
    this.config = config;
    this.initializeProvider();
  }

  private initializeProvider(): void {
    const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or provide apiKey in config.');
    }

    const providerSettings: LLMProviderSettings = {
      apiKey,
      baseURL: this.config.baseURL || 'https://openrouter.ai/api/v1',
      timeout: this.config.timeout || 30000,
    };

    this.openrouter = createOpenRouter(providerSettings);
    logger.info('LLM provider initialized', { 
      provider: 'openrouter',
      baseURL: providerSettings.baseURL 
    });
  }

  /**
   * Get a chat model instance
   */
  chat(modelId: string): LanguageModelV1 {
    try {
      return this.openrouter.chat(modelId);
    } catch (error) {
      logger.error('Failed to create chat model', { modelId, error });
      throw new Error(`Failed to create chat model ${modelId}: ${error}`);
    }
  }

  /**
   * Get a utility model (defaults to gpt-4o-mini)
   */
  utility(): LanguageModelV1 {
    return this.chat('openai/gpt-4o-mini');
  }

  /**
   * Test if a model is accessible
   */
  async testModel(modelId: string): Promise<{ success: boolean; error?: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      const model = this.chat(modelId);
      
      // Try a simple completion to test the model
      const result = await model.doGenerate({
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [
          {
            role: 'user',
            content: 'Hello, this is a test message. Please respond with "OK".'
          }
        ],
        abortSignal: AbortSignal.timeout(this.config.timeout || 30000)
      });

      const duration = Date.now() - startTime;
      
      if (result.text && result.text.length > 0) {
        logger.info('Model test successful', { modelId, duration });
        return { success: true, duration };
      } else {
        logger.warn('Model test failed: empty response', { modelId, duration });
        return { success: false, error: 'Empty response from model', duration };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Model test failed', { modelId, error: errorMessage, duration });
      return { success: false, error: errorMessage, duration };
    }
  }

  /**
   * Get available models (this would need to be implemented based on OpenRouter API)
   */
  async getAvailableModels(): Promise<string[]> {
    // This is a placeholder - in a real implementation, you'd call the OpenRouter API
    // to get the list of available models
    return [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-4-turbo',
      'openai/gpt-3.5-turbo',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-8b-instruct'
    ];
  }
}
