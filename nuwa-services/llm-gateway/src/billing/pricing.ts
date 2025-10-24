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
 * Pricing registry with provider-separated pricing support
 */
export class PricingRegistry {
  private static instance: PricingRegistry;
  
  // Provider-separated pricing storage
  private providerPricing = new Map<string, {
    models: Record<string, ModelPricing>;
    patterns: Array<{ pattern: RegExp; baseModel: string }>;
    version: string;
  }>();
  
  // Global overrides (applied across all providers)
  private globalOverrides: Record<string, ModelPricing> = {};

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
   * Load pricing from configuration file (provider-separated)
   */
  private loadFromConfig(): void {
    try {
      const providerConfigs = pricingConfigLoader.getProviderConfigs();
      
      for (const [provider, config] of Object.entries(providerConfigs)) {
        this.providerPricing.set(provider, {
          models: config.models,
          patterns: config.modelFamilyPatterns.map(p => ({
            pattern: new RegExp(p.pattern),
            baseModel: p.baseModel
          })),
          version: config.version
        });
        
        console.log(`📊 Loaded ${Object.keys(config.models).length} models for provider: ${provider} (version: ${config.version})`);
      }
      
      console.log(`📊 Total providers loaded: ${this.providerPricing.size}`);
    } catch (error) {
      console.error('Failed to load pricing configuration:', error);
      // Fallback to empty config to prevent crashes
      this.providerPricing.clear();
    }
  }

  /**
   * Load pricing overrides from environment variable (global overrides)
   */
  private loadOverrides(): void {
    try {
      const overrides = process.env.PRICING_OVERRIDES;
      if (overrides) {
        const parsed = JSON.parse(overrides) as Record<string, ModelPricing>;
        this.globalOverrides = parsed;
        console.log(`📊 Applied ${Object.keys(parsed).length} global pricing overrides`);
      }
    } catch (error) {
      console.error('Error loading pricing overrides:', error);
    }
  }

  /**
   * Get pricing for a specific model from a specific provider
   * @param provider Provider name (e.g., 'openai', 'claude')
   * @param model Model name
   * @returns ModelPricing or null if not found
   */
  getProviderPricing(provider: string, model: string): ModelPricing | null {
    // Check global overrides first
    if (this.globalOverrides[model]) {
      return this.globalOverrides[model];
    }

    const providerConfig = this.providerPricing.get(provider);
    if (!providerConfig) {
      return null;
    }

    // Direct lookup
    if (providerConfig.models[model]) {
      return providerConfig.models[model];
    }

    // Pattern matching for model families
    for (const { pattern, baseModel } of providerConfig.patterns) {
      if (pattern.test(model) && providerConfig.models[baseModel]) {
        return providerConfig.models[baseModel];
      }
    }

    return null;
  }

  /**
   * Calculate cost based on token usage for a specific provider
   * @param provider Provider name (e.g., 'openai', 'claude')
   * @param model Model name
   * @param usage Usage information
   * @returns PricingResult or null if calculation fails
   */
  calculateProviderCost(provider: string, model: string, usage: UsageInfo): PricingResult | null {
    const pricing = this.getProviderPricing(provider, model);
    if (!pricing) {
      return null;
    }

    const promptTokens = usage.promptTokens || 0;
    const completionTokens = usage.completionTokens || 0;

    // Calculate cost: (tokens / TOKENS_PER_MILLION) * price_per_million
    const promptCost = (promptTokens / TOKENS_PER_MILLION) * pricing.promptPerMTokUsd;
    const completionCost = (completionTokens / TOKENS_PER_MILLION) * pricing.completionPerMTokUsd;
    const totalCost = promptCost + completionCost;

    const providerConfig = this.providerPricing.get(provider);
    const version = providerConfig?.version || 'unknown';

    return {
      costUsd: totalCost,
      source: 'gateway-pricing',
      pricingVersion: `${provider}-${version}`,
      model,
      usage,
    };
  }

  /**
   * Get current pricing version for a provider
   */
  getProviderVersion(provider: string): string {
    return this.providerPricing.get(provider)?.version || 'unknown';
  }

  /**
   * List all available models for a provider
   */
  listProviderModels(provider: string): string[] {
    const config = this.providerPricing.get(provider);
    return config ? Object.keys(config.models) : [];
  }

  /**
   * List all registered providers
   */
  listProviders(): string[] {
    return Array.from(this.providerPricing.keys());
  }

  /**
   * Update pricing for a model in a specific provider (runtime override)
   */
  updateProviderPricing(provider: string, model: string, pricing: ModelPricing): void {
    const config = this.providerPricing.get(provider);
    if (config) {
      config.models[model] = pricing;
    }
  }

  /**
   * Reload pricing from configuration file (for hot reload)
   */
  reload(): void {
    try {
      pricingConfigLoader.reloadConfig();
      this.providerPricing.clear();
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
