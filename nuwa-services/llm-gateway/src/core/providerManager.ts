import { LLMProvider, ProviderConfig } from '../providers/LLMProvider.js';
import OpenRouterService from '../services/openrouter.js';
import LiteLLMService from '../services/litellm.js';
import { OpenAIProvider } from '../providers/openai.js';

/**
 * Provider configuration for initialization
 */
interface ProviderInitConfig {
  name: string;
  instance: LLMProvider;
  requiresApiKey: boolean;
  supportsNativeUsdCost: boolean;
  apiKeyEnvVar?: string;
  baseUrl: string;
  allowedPaths: string[];
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  defaultCheck: () => boolean;
}

/**
 * Manages LLM providers registration, configuration, and access
 * Separated from PaymentKit to enable independent testing
 */
export class ProviderManager {
  private providers = new Map<string, ProviderConfig>();
  private static instance: ProviderManager;

  private constructor() {}

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  /**
   * Initialize providers based on environment configuration
   * This method can be called independently for testing
   */
  initializeProviders(options: { skipEnvCheck?: boolean } = {}): {
    registered: string[];
    skipped: string[];
  } {
    console.log('🚀 [ProviderManager] Starting provider initialization...');
    
    const registeredProviders: string[] = [];
    const skippedProviders: string[] = [];

    // Create provider instances
    const openrouterProvider = new OpenRouterService();
    const litellmProvider = new LiteLLMService();
    const openaiProvider = new OpenAIProvider();

    // Provider configurations
    const providerConfigs: ProviderInitConfig[] = [
      {
        name: 'openrouter',
        instance: openrouterProvider,
        requiresApiKey: true,
        supportsNativeUsdCost: true,
        apiKeyEnvVar: 'OPENROUTER_API_KEY',
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
        allowedPaths: [...openrouterProvider.SUPPORTED_PATHS],
        requiredEnvVars: ['OPENROUTER_API_KEY'],
        optionalEnvVars: ['OPENROUTER_BASE_URL'],
        defaultCheck: () => !!process.env.OPENROUTER_API_KEY
      },
      {
        name: 'litellm', 
        instance: litellmProvider,
        requiresApiKey: true,
        supportsNativeUsdCost: true,
        apiKeyEnvVar: 'LITELLM_API_KEY',
        baseUrl: process.env.LITELLM_BASE_URL || 'https://litellm.example.com',
        allowedPaths: [...litellmProvider.SUPPORTED_PATHS],
        requiredEnvVars: ['LITELLM_BASE_URL', 'LITELLM_API_KEY'],
        optionalEnvVars: [],
        defaultCheck: () => !!process.env.LITELLM_BASE_URL && !!process.env.LITELLM_API_KEY
      },
      {
        name: 'openai',
        instance: openaiProvider,
        requiresApiKey: true,
        supportsNativeUsdCost: false,
        apiKeyEnvVar: 'OPENAI_API_KEY',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
        allowedPaths: [...openaiProvider.SUPPORTED_PATHS],
        requiredEnvVars: ['OPENAI_API_KEY'],
        optionalEnvVars: ['OPENAI_BASE_URL'],
        defaultCheck: () => !!process.env.OPENAI_API_KEY
      }
    ];

    for (const config of providerConfigs) {
      // Check if provider should be registered
      const missingRequired = config.requiredEnvVars.filter(envVar => !process.env[envVar]);
      const shouldRegister = options.skipEnvCheck || (missingRequired.length === 0 && config.defaultCheck());

      if (shouldRegister) {
        // Resolve API key if required
        let apiKey: string | undefined;
        if (config.requiresApiKey && !options.skipEnvCheck) {
          if (!config.apiKeyEnvVar) {
            console.error(`Provider ${config.name} requires API key but apiKeyEnvVar not specified. Skipping registration.`);
            skippedProviders.push(`${config.name} (missing apiKeyEnvVar configuration)`);
            continue;
          }
          
          apiKey = process.env[config.apiKeyEnvVar];
          if (!apiKey) {
            console.error(`API key not found for provider ${config.name}: Environment variable '${config.apiKeyEnvVar}' is not set`);
            skippedProviders.push(`${config.name} (missing ${config.apiKeyEnvVar})`);
            continue;
          }
        }

        this.register({
          name: config.name,
          instance: config.instance,
          requiresApiKey: config.requiresApiKey,
          supportsNativeUsdCost: config.supportsNativeUsdCost,
          apiKey: apiKey,
          baseUrl: config.baseUrl,
          allowedPaths: config.allowedPaths,
        });
        registeredProviders.push(config.name);
        
        console.log(`✅ [ProviderManager] Registered ${config.name}`);
        
        // Log configuration status for each provider
        if (!options.skipEnvCheck) {
          const configStatus = [];
          if (config.requiresApiKey) configStatus.push(`API key: ${config.apiKeyEnvVar}`);
          config.requiredEnvVars.forEach(envVar => {
            if (envVar !== config.apiKeyEnvVar) configStatus.push(`${envVar}: configured`);
          });
          config.optionalEnvVars.forEach(envVar => {
            if (process.env[envVar]) configStatus.push(`${envVar}: custom`);
            else configStatus.push(`${envVar}: default`);
          });
          
          if (configStatus.length > 0) {
            console.log(`   ${config.name}: ${configStatus.join(', ')}`);
          }
        }
      } else {
        skippedProviders.push(`${config.name} (missing: ${missingRequired.join(', ')})`);
      }
    }

    // Log results
    console.log('🔌 Registered providers:', registeredProviders.join(', '));
    
    if (skippedProviders.length > 0 && !options.skipEnvCheck) {
      console.log('⏭️  Skipped providers:', skippedProviders.join(', '));
      console.log('💡 Configure required environment variables to enable these providers');
    }

    if (registeredProviders.length === 0) {
      console.warn('⚠️  No providers registered! Please check your environment configuration.');
    }

    return { registered: registeredProviders, skipped: skippedProviders };
  }

  /**
   * Register a provider configuration
   */
  register(config: ProviderConfig): void {
    if (this.providers.has(config.name)) {
      console.warn(`Provider '${config.name}' is already registered. Overwriting.`);
    }
    
    this.providers.set(config.name, config);
    console.log(`📝 [ProviderManager] Registered provider: ${config.name}`);
  }

  /**
   * Get provider configuration by name
   */
  get(name: string): ProviderConfig | null {
    return this.providers.get(name) || null;
  }

  /**
   * Check if provider exists
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * List all registered provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider instance by name
   */
  getProvider(name: string): LLMProvider | null {
    const config = this.providers.get(name);
    return config ? config.instance : null;
  }

  /**
   * Get API key for a provider
   * @param providerName Provider name
   * @returns API key string or null if provider doesn't require API key
   * @throws Error if provider not found or required API key not available
   */
  getProviderApiKey(providerName: string): string | null {
    const config = this.providers.get(providerName);
    if (!config) {
      throw new Error(`Provider '${providerName}' not found in registry`);
    }

    if (!config.requiresApiKey) {
      return null;
    }

    if (!config.apiKey) {
      throw new Error(`API key not available for provider '${providerName}'`);
    }

    return config.apiKey;
  }

  /**
   * Unregister a provider
   */
  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Clear all providers (useful for testing)
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

  /**
   * Create a test instance with custom providers (for testing)
   */
  static createTestInstance(): ProviderManager {
    return new ProviderManager();
  }
}

// Export singleton instance for backward compatibility
export const providerManager = ProviderManager.getInstance();
