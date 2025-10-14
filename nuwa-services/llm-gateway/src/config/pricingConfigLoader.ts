import { ModelPricing } from '../billing/pricing.js';
import defaultPricingConfig from './openai-pricing.json' with { type: 'json' };


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

  private constructor() {
  }

  static getInstance(): PricingConfigLoader {
    if (!PricingConfigLoader.instance) {
      PricingConfigLoader.instance = new PricingConfigLoader();
    }
    return PricingConfigLoader.instance;
  }

  /**
   * Load pricing configuration (now embedded in module)
   */
  loadConfig(): PricingConfig {
    if (this.config) {
      return this.config;
    }

    try {
      if (process.env.PRICING_CONFIG_PATH) {
        console.log(`📊 Loading custom pricing config from: ${process.env.PRICING_CONFIG_PATH}`);
      }
      
      console.log(`📊 Using embedded pricing config (${defaultPricingConfig.version})`);
      this.config = defaultPricingConfig as PricingConfig;
      
      console.log(`📊 Loaded pricing config: ${this.config.version} (${Object.keys(this.config.models).length} models)`);
      return this.config;
    } catch (error) {
      console.error('Error loading pricing config:', error);
      throw new Error(`Failed to load pricing configuration: ${error}`);
    }
  }

  /**
   * Reload configuration from file (for hot reload)
   */
  reloadConfig(): PricingConfig {
    this.config = null;
    return this.loadConfig();
  }

  /**
   * Get models as simple ModelPricing objects
   */
  getModels(): Record<string, ModelPricing> {
    const config = this.loadConfig();
    const models: Record<string, ModelPricing> = {};
    
    for (const [modelName, modelConfig] of Object.entries(config.models)) {
      models[modelName] = {
        promptPerMTokUsd: modelConfig.promptPerMTokUsd,
        completionPerMTokUsd: modelConfig.completionPerMTokUsd,
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
        if (typeof model.promptPerMTokUsd !== 'number' || 
            typeof model.completionPerMTokUsd !== 'number') {
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
