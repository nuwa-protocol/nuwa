export type OpenRouterCompletionModelId = 
  | 'openai/gpt-3.5-turbo-instruct'
  | string;

export interface OpenRouterCompletionSettings {
  /**
   * The maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
   * The temperature for sampling.
   */
  temperature?: number;

  /**
   * The top-p value for sampling.
   */
  topP?: number;

  /**
   * The frequency penalty.
   */
  frequencyPenalty?: number;

  /**
   * The presence penalty.
   */
  presencePenalty?: number;

  /**
   * The stop sequences.
   */
  stop?: string[];

  /**
   * The seed for sampling.
   */
  seed?: number;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   */
  fetch?: typeof fetch;

  /**
   * Abort signal for the request.
   */
  abortSignal?: AbortSignal;
}
