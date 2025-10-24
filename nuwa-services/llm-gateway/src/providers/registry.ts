import { LLMProvider, ProviderConfig } from './LLMProvider.js';

/**
 * Registry for managing LLM providers
 * Supports dynamic registration and retrieval of providers
 */
export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providers = new Map<string, ProviderConfig>();

  private constructor() {}

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a new provider or update existing one
   */
  register(config: ProviderConfig, options: { skipApiKeyValidation?: boolean } = {}): void {
    if (this.providers.has(config.name)) {
      console.warn(
        `Provider '${config.name}' is already registered in global registry. Updating configuration.`
      );
    }

    // Validate configuration (skip in test mode)
    if (config.requiresApiKey && !config.apiKey && !options.skipApiKeyValidation) {
      throw new Error(`Provider '${config.name}' requires an API key but none was provided`);
    }

    this.providers.set(config.name, config);
  }

  /**
   * Get a provider by name
   */
  get(name: string): ProviderConfig | null {
    return this.providers.get(name) || null;
  }

  /**
   * Check if a provider exists
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * List all registered providers
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider instance
   */
  getProvider(name: string): LLMProvider | null {
    const config = this.get(name);
    return config ? config.instance : null;
  }

  /**
   * Get API key for a provider (if required)
   * @param name Provider name
   * @returns API key string or null if provider doesn't require API key
   * @throws Error if provider not found or required API key not available
   */
  getProviderApiKey(name: string): string | null {
    const config = this.get(name);
    if (!config) {
      throw new Error(`Provider '${name}' is not registered`);
    }

    if (!config.requiresApiKey) {
      return null; // Provider doesn't need API key
    }

    // At this point, API key should be cached during registration
    if (!config.apiKey) {
      throw new Error(
        `API key not available for provider '${name}' - this should not happen if registration was successful`
      );
    }

    return config.apiKey;
  }

  /**
   * Remove a provider (for testing/cleanup)
   */
  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Clear all providers (for testing)
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get all provider configurations (useful for testing)
   */
  getAllConfigs(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
}

/**
 * Default registry instance
 */
export const providerRegistry = ProviderRegistry.getInstance();
