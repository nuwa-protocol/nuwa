import { ModelPricing } from '../billing/pricing.js';
import openaiPricingConfig from './openai-pricing.json' with { type: 'json' };
import claudePricingConfig from './claude-pricing.json' with { type: 'json' };
import geminiPricingConfig from './gemini-pricing.json' with { type: 'json' };

/**
 * Extended model pricing with description
 */
export interface ModelPricingConfig extends ModelPricing {
  description?: string;
}

/**
 * Model family pattern configuration
 */
export interface ModelFamilyPattern {
  pattern: string;
  baseModel: string;
  description?: string;
}

/**
 * Pricing configuration file structure
 */
export interface PricingConfig {
  version: string;
  models: Record<string, ModelPricingConfig>;
  modelFamilyPatterns: ModelFamilyPattern[];
}

/**
 * Configuration loader for pricing data
 */
export class PricingConfigLoader {
  private static instance: PricingConfigLoader;
  private config: PricingConfig | null = null;

  private constructor() {}

  static getInstance(): PricingConfigLoader {
    if (!PricingConfigLoader.instance) {
      PricingConfigLoader.instance = new PricingConfigLoader();
    }
    return PricingConfigLoader.instance;
  }

  /**
   * Load pricing configuration from multiple provider configs
   */
  loadConfig(): PricingConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // Load individual provider configs
      const configs = [
        { name: 'OpenAI', config: openaiPricingConfig as PricingConfig },
        { name: 'Claude', config: claudePricingConfig as PricingConfig },
        { name: 'Gemini', config: geminiPricingConfig as PricingConfig },
      ];

      // Merge all configurations
      this.config = this.mergeConfigs(configs);

      console.log(
        `📊 Loaded merged pricing config: ${Object.keys(this.config.models).length} models from ${configs.length} providers`
      );
      return this.config;
    } catch (error) {
      console.error('Error loading pricing config:', error);
      throw new Error(`Failed to load pricing configuration: ${error}`);
    }
  }

  /**
   * Merge multiple provider configurations into a single config
   */
  private mergeConfigs(configs: Array<{ name: string; config: PricingConfig }>): PricingConfig {
    const merged: PricingConfig = {
      version: 'merged-' + new Date().toISOString().split('T')[0],
      models: {},
      modelFamilyPatterns: [],
    };

    for (const { name, config } of configs) {
      if (config && config.models) {
        // Merge models
        const modelCount = Object.keys(config.models).length;
        Object.assign(merged.models, config.models);
        console.log(`📊 Merged ${modelCount} models from ${name} config`);

        // Merge model family patterns
        if (config.modelFamilyPatterns) {
          merged.modelFamilyPatterns.push(...config.modelFamilyPatterns);
        }
      }
    }

    return merged;
  }

  /**
   * Reload configuration from file (for hot reload)
   */
  reloadConfig(): PricingConfig {
    this.config = null;
    return this.loadConfig();
  }

  /**
   * Get provider-separated configurations
   * Returns a map of provider name to their pricing config
   */
  getProviderConfigs(): Record<string, PricingConfig> {
    // Return provider-separated configs
    return {
      openai: openaiPricingConfig as PricingConfig,
      claude: claudePricingConfig as PricingConfig,
      gemini: geminiPricingConfig as PricingConfig,
    };
  }

  /**
   * Get models for a specific provider
   */
  getProviderModels(provider: string): Record<string, ModelPricing> {
    const configs = this.getProviderConfigs();
    const providerConfig = configs[provider];

    if (!providerConfig) {
      return {};
    }

    const models: Record<string, ModelPricing> = {};
    for (const [model, pricing] of Object.entries(providerConfig.models)) {
      models[model] = {
        promptPerMTokUsd: pricing.promptPerMTokUsd,
        completionPerMTokUsd: pricing.completionPerMTokUsd,
      };
    }
    return models;
  }

  /**
   * Get model family patterns as RegExp objects
   */
  getModelFamilyPatterns(): Array<{ pattern: RegExp; baseModel: string }> {
    const config = this.loadConfig();
    return config.modelFamilyPatterns.map(({ pattern, baseModel }) => ({
      pattern: new RegExp(pattern),
      baseModel,
    }));
  }

  /**
   * Get configuration version
   */
  getVersion(): string {
    const config = this.loadConfig();
    return config.version;
  }

  /**
   * Validate pricing configuration
   */
  validateConfig(config: PricingConfig): boolean {
    try {
      if (!config.version || !config.models || !config.modelFamilyPatterns) {
        return false;
      }

      // Validate models
      for (const [modelName, model] of Object.entries(config.models)) {
        if (
          typeof model.promptPerMTokUsd !== 'number' ||
          typeof model.completionPerMTokUsd !== 'number'
        ) {
          console.error(`Invalid pricing for model ${modelName}`);
          return false;
        }
      }

      // Validate model family patterns
      for (const pattern of config.modelFamilyPatterns) {
        if (!pattern.pattern || !pattern.baseModel) {
          console.error(`Invalid model family pattern:`, pattern);
          return false;
        }

        // Check if baseModel exists in models
        if (!config.models[pattern.baseModel]) {
          console.error(`Base model ${pattern.baseModel} not found in models`);
          return false;
        }

        // Test if pattern is valid regex
        try {
          new RegExp(pattern.pattern);
        } catch (e) {
          console.error(`Invalid regex pattern: ${pattern.pattern}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Config validation error:', error);
      return false;
    }
  }
}

/**
 * Default pricing config loader instance
 */
export const pricingConfigLoader = PricingConfigLoader.getInstance();
