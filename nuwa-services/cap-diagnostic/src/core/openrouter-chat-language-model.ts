import type { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1CallWarning, LanguageModelV1FinishReason, LanguageModelV1StreamPart } from '@ai-sdk/provider';
import { convertToOpenRouterChatMessages } from './convert-to-openrouter-chat-messages.js';
import { mapOpenRouterFinishReason } from './map-openrouter-finish-reason.js';
import type { OpenRouterChatModelId, OpenRouterChatSettings } from './types/openrouter-chat-settings.js';

export class OpenRouterChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'openrouter.chat';

  readonly modelId: OpenRouterChatModelId;
  readonly settings: OpenRouterChatSettings;

  constructor(
    modelId: OpenRouterChatModelId,
    settings: OpenRouterChatSettings = {},
    private readonly options: {
      provider: string;
      url: (path: string) => string;
      headers: () => Record<string, string>;
      compatibility: 'strict' | 'compatible';
      fetch?: typeof fetch;
      extraBody?: Record<string, unknown>;
    }
  ) {
    this.modelId = modelId;
    this.settings = settings;
  }

  get modelName(): string {
    return this.modelId;
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<{
    text: string;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      promptTokens: number;
      completionTokens: number;
    };
    warnings?: LanguageModelV1CallWarning[];
  }> {
    const response = await this.fetch(options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${result.error?.message || 'Unknown error'}`);
    }

    const choice = result.choices?.[0];
    if (!choice) {
      throw new Error('No choices returned from OpenRouter API');
    }

    return {
      text: choice.message?.content || '',
      finishReason: mapOpenRouterFinishReason(choice.finish_reason),
      usage: {
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0,
      },
    };
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
  }> {
    const response = await this.fetch(options, { stream: true });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter API error: ${error.error?.message || 'Unknown error'}`);
    }

    return {
      stream: this.createStream(response.body!),
    };
  }

  private async fetch(options: LanguageModelV1CallOptions, requestOptions: { stream?: boolean } = {}): Promise<Response> {
    const messages = convertToOpenRouterChatMessages(options.prompt);
    
    const body = {
      model: this.modelId,
      messages,
      max_tokens: this.settings.maxTokens,
      temperature: this.settings.temperature,
      top_p: this.settings.topP,
      frequency_penalty: this.settings.frequencyPenalty,
      presence_penalty: this.settings.presencePenalty,
      stop: this.settings.stop,
      seed: this.settings.seed,
      stream: requestOptions.stream,
      ...this.options.extraBody,
    };

    const headers = {
      'Content-Type': 'application/json',
      ...this.options.headers(),
      ...this.settings.headers,
    };

    return fetch(this.options.url('/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.settings.abortSignal,
      // fetch: this.options.fetch || this.settings.fetch, // Remove fetch from RequestInit
    });
  }

  private createStream(body: ReadableStream<Uint8Array>): ReadableStream<LanguageModelV1StreamPart> {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const choice = parsed.choices?.[0];
                  if (choice?.delta?.content) {
                    controller.enqueue({
                      type: 'text-delta',
                      textDelta: choice.delta.content,
                    });
                  }
                } catch (e) {
                  // Ignore parsing errors for malformed chunks
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}
