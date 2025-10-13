/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Price per 1M prompt tokens in USD */
  promptPerMTokUsd: number;
  /** Price per 1M completion tokens in USD */
  completionPerMTokUsd: number;
}

/**
 * Usage information from LLM response
 */
export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Pricing calculation result
 */
export interface PricingResult {
  costUsd: number;
  source: 'provider' | 'gateway-pricing';
  pricingVersion?: string;
  model?: string;
  usage?: UsageInfo;
}

/**
 * Default OpenAI model pricing (as of latest known rates)
 * These can be overridden via environment variables
 */
export const DEFAULT_OPENAI_PRICING: Record<string, ModelPricing> = {
  // GPT-4 models
  'gpt-4': {
    promptPerMTokUsd: 30.0,
    completionPerMTokUsd: 60.0,
  },
  'gpt-4-0613': {
    promptPerMTokUsd: 30.0,
    completionPerMTokUsd: 60.0,
  },
  'gpt-4-turbo': {
    promptPerMTokUsd: 10.0,
    completionPerMTokUsd: 30.0,
  },
  'gpt-4-turbo-preview': {
    promptPerMTokUsd: 10.0,
    completionPerMTokUsd: 30.0,
  },
  'gpt-4o': {
    promptPerMTokUsd: 5.0,
    completionPerMTokUsd: 15.0,
  },
  'gpt-4o-mini': {
    promptPerMTokUsd: 0.15,
    completionPerMTokUsd: 0.6,
  },

  // GPT-3.5 models
  'gpt-3.5-turbo': {
    promptPerMTokUsd: 0.5,
    completionPerMTokUsd: 1.5,
  },
  'gpt-3.5-turbo-0125': {
    promptPerMTokUsd: 0.5,
    completionPerMTokUsd: 1.5,
  },
  'gpt-3.5-turbo-instruct': {
    promptPerMTokUsd: 1.5,
    completionPerMTokUsd: 2.0,
  },

  // Text embedding models
  'text-embedding-ada-002': {
    promptPerMTokUsd: 0.1,
    completionPerMTokUsd: 0.0,
  },
  'text-embedding-3-small': {
    promptPerMTokUsd: 0.02,
    completionPerMTokUsd: 0.0,
  },
  'text-embedding-3-large': {
    promptPerMTokUsd: 0.13,
    completionPerMTokUsd: 0.0,
  },

  // Whisper
  'whisper-1': {
    promptPerMTokUsd: 6.0, // $0.006 per minute, approximated
    completionPerMTokUsd: 0.0,
  },

  // TTS
  'tts-1': {
    promptPerMTokUsd: 15.0, // $0.015 per 1K characters, approximated
    completionPerMTokUsd: 0.0,
  },
  'tts-1-hd': {
    promptPerMTokUsd: 30.0, // $0.030 per 1K characters, approximated
    completionPerMTokUsd: 0.0,
  },

  // DALL-E (approximated as token pricing)
  'dall-e-2': {
    promptPerMTokUsd: 20.0, // Approximation
    completionPerMTokUsd: 0.0,
  },
  'dall-e-3': {
    promptPerMTokUsd: 40.0, // Approximation
    completionPerMTokUsd: 0.0,
  },
};

/**
 * Model family patterns for pricing lookup
 * Allows matching model variants to base pricing
 */
export const MODEL_FAMILY_PATTERNS: Array<{ pattern: RegExp; baseModel: string }> = [
  // GPT-4 variants
  { pattern: /^gpt-4o-mini/, baseModel: 'gpt-4o-mini' },
  { pattern: /^gpt-4o/, baseModel: 'gpt-4o' },
  { pattern: /^gpt-4-turbo/, baseModel: 'gpt-4-turbo' },
  { pattern: /^gpt-4/, baseModel: 'gpt-4' },

  // GPT-3.5 variants
  { pattern: /^gpt-3\.5-turbo-instruct/, baseModel: 'gpt-3.5-turbo-instruct' },
  { pattern: /^gpt-3\.5-turbo/, baseModel: 'gpt-3.5-turbo' },

  // Embedding variants
  { pattern: /^text-embedding-3-large/, baseModel: 'text-embedding-3-large' },
  { pattern: /^text-embedding-3-small/, baseModel: 'text-embedding-3-small' },
  { pattern: /^text-embedding-ada/, baseModel: 'text-embedding-ada-002' },

  // Other model families
  { pattern: /^whisper/, baseModel: 'whisper-1' },
  { pattern: /^tts-1-hd/, baseModel: 'tts-1-hd' },
  { pattern: /^tts/, baseModel: 'tts-1' },
  { pattern: /^dall-e-3/, baseModel: 'dall-e-3' },
  { pattern: /^dall-e/, baseModel: 'dall-e-2' },
];

/**
 * Pricing registry with override support
 */
export class PricingRegistry {
  private static instance: PricingRegistry;
  private pricing: Record<string, ModelPricing>;
  private version: string;

  private constructor() {
    this.pricing = { ...DEFAULT_OPENAI_PRICING };
    this.version = process.env.OPENAI_PRICING_VERSION || '2024-01';
    this.loadOverrides();
  }

  static getInstance(): PricingRegistry {
    if (!PricingRegistry.instance) {
      PricingRegistry.instance = new PricingRegistry();
    }
    return PricingRegistry.instance;
  }

  /**
   * Load pricing overrides from environment variable
   */
  private loadOverrides(): void {
    try {
      const overrides = process.env.PRICING_OVERRIDES;
      if (overrides) {
        const parsed = JSON.parse(overrides) as Record<string, ModelPricing>;
        this.pricing = { ...this.pricing, ...parsed };
        console.log(`📊 Loaded ${Object.keys(parsed).length} pricing overrides`);
      }
    } catch (error) {
      console.error('Error loading pricing overrides:', error);
    }
  }

  /**
   * Get pricing for a specific model
   */
  getPricing(model: string): ModelPricing | null {
    // Direct lookup
    if (this.pricing[model]) {
      return this.pricing[model];
    }

    // Pattern matching for model families
    for (const { pattern, baseModel } of MODEL_FAMILY_PATTERNS) {
      if (pattern.test(model) && this.pricing[baseModel]) {
        return this.pricing[baseModel];
      }
    }

    return null;
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(model: string, usage: UsageInfo): PricingResult | null {
    const pricing = this.getPricing(model);
    if (!pricing) {
      return null;
    }

    const promptTokens = usage.promptTokens || 0;
    const completionTokens = usage.completionTokens || 0;

    // Calculate cost: (tokens / 1,000,000) * price_per_million
    const promptCost = (promptTokens / 1_000_000) * pricing.promptPerMTokUsd;
    const completionCost = (completionTokens / 1_000_000) * pricing.completionPerMTokUsd;
    const totalCost = promptCost + completionCost;

    return {
      costUsd: totalCost,
      source: 'gateway-pricing',
      pricingVersion: this.version,
      model,
      usage,
    };
  }

  /**
   * Get current pricing version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * List all available models
   */
  listModels(): string[] {
    return Object.keys(this.pricing);
  }

  /**
   * Update pricing for a model (runtime override)
   */
  updatePricing(model: string, pricing: ModelPricing): void {
    this.pricing[model] = pricing;
  }

  /**
   * Reload pricing from environment (for hot reload)
   */
  reload(): void {
    this.pricing = { ...DEFAULT_OPENAI_PRICING };
    this.loadOverrides();
  }
}

/**
 * Default pricing registry instance
 */
export const pricingRegistry = PricingRegistry.getInstance();
