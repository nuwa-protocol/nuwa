import { pricingConfigLoader } from '../config/pricingConfigLoader.js';

/**
 * Constants for pricing calculations
 */
const TOKENS_PER_MILLION = 1_000_000;

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
 * Pricing registry with override support
 */
export class PricingRegistry {
  private static instance: PricingRegistry;
  private pricing: Record<string, ModelPricing> = {};
  private modelFamilyPatterns: Array<{ pattern: RegExp; baseModel: string }> = [];
  private version: string = 'unknown';

  private constructor() {
    this.loadFromConfig();
    this.loadOverrides();
  }

  static getInstance(): PricingRegistry {
    if (!PricingRegistry.instance) {
      PricingRegistry.instance = new PricingRegistry();
    }
    return PricingRegistry.instance;
  }

  /**
   * Load pricing from configuration file
   */
  private loadFromConfig(): void {
    try {
      this.pricing = pricingConfigLoader.getModels();
      this.modelFamilyPatterns = pricingConfigLoader.getModelFamilyPatterns();
      this.version = pricingConfigLoader.getVersion();
      
      console.log(`📊 Loaded pricing for ${Object.keys(this.pricing).length} models (version: ${this.version})`);
    } catch (error) {
      console.error('Failed to load pricing configuration:', error);
      // Fallback to empty config to prevent crashes
      this.pricing = {};
      this.modelFamilyPatterns = [];
      this.version = 'unknown';
    }
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
        console.log(`📊 Applied ${Object.keys(parsed).length} pricing overrides`);
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
    for (const { pattern, baseModel } of this.modelFamilyPatterns) {
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

    // Calculate cost: (tokens / TOKENS_PER_MILLION) * price_per_million
    const promptCost = (promptTokens / TOKENS_PER_MILLION) * pricing.promptPerMTokUsd;
    const completionCost = (completionTokens / TOKENS_PER_MILLION) * pricing.completionPerMTokUsd;
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
   * Reload pricing from configuration file (for hot reload)
   */
  reload(): void {
    try {
      pricingConfigLoader.reloadConfig();
      this.loadFromConfig();
      this.loadOverrides();
      console.log('📊 Pricing configuration reloaded successfully');
    } catch (error) {
      console.error('Failed to reload pricing configuration:', error);
    }
  }
}

/**
 * Default pricing registry instance
 */
export const pricingRegistry = PricingRegistry.getInstance();
