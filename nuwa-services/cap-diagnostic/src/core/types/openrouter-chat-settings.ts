import type { z } from 'zod';

export type OpenRouterChatModelId = 
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  | 'openai/gpt-4-turbo'
  | 'openai/gpt-3.5-turbo'
  | 'anthropic/claude-3.5-sonnet'
  | 'anthropic/claude-3-haiku'
  | 'google/gemini-pro-1.5'
  | 'meta-llama/llama-3.1-8b-instruct'
  | string;

export interface OpenRouterChatSettings {
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
