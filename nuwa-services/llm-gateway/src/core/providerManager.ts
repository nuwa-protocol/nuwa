import { LLMProvider, ProviderConfig } from '../providers/LLMProvider.js';
import OpenRouterService from '../services/openrouter.js';
import LiteLLMService from '../services/litellm.js';
import { OpenAIProvider } from '../providers/openai.js';
import { ClaudeProvider } from '../providers/claude.js';
import { providerRegistry } from '../providers/registry.js';

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
 * Manages LLM providers initialization and configuration
 * Delegates storage to ProviderRegistry to avoid duplication
 */
export class ProviderManager {
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
    const claudeProvider = new ClaudeProvider();

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
        defaultCheck: () => !!process.env.OPENROUTER_API_KEY,
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
        defaultCheck: () => !!process.env.LITELLM_BASE_URL && !!process.env.LITELLM_API_KEY,
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
        defaultCheck: () => !!process.env.OPENAI_API_KEY,
      },
      {
        name: 'claude',
        instance: claudeProvider,
        requiresApiKey: true,
        supportsNativeUsdCost: false,
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        allowedPaths: [...claudeProvider.SUPPORTED_PATHS],
        requiredEnvVars: ['ANTHROPIC_API_KEY'],
        optionalEnvVars: ['ANTHROPIC_BASE_URL'],
        defaultCheck: () => !!process.env.ANTHROPIC_API_KEY,
      },
    ];

    for (const config of providerConfigs) {
      // Check if provider should be registered
      const missingRequired = config.requiredEnvVars.filter(envVar => !process.env[envVar]);
      const shouldRegister =
        options.skipEnvCheck || (missingRequired.length === 0 && config.defaultCheck());

      if (shouldRegister) {
        // Resolve API key if required
        let apiKey: string | undefined;
        if (config.requiresApiKey && !options.skipEnvCheck) {
          if (!config.apiKeyEnvVar) {
            console.error(
              `Provider ${config.name} requires API key but apiKeyEnvVar not specified. Skipping registration.`
            );
            skippedProviders.push(`${config.name} (missing apiKeyEnvVar configuration)`);
            continue;
          }

          apiKey = process.env[config.apiKeyEnvVar];
          if (!apiKey) {
            console.error(
              `API key not found for provider ${config.name}: Environment variable '${config.apiKeyEnvVar}' is not set`
            );
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
   * Delegates to ProviderRegistry for actual storage
   */
  register(config: ProviderConfig): void {
    // Pass skipApiKeyValidation if this is a test instance (no API key required)
    const skipApiKeyValidation = !config.apiKey && config.requiresApiKey;
    providerRegistry.register(config, { skipApiKeyValidation });
    console.log(`📝 [ProviderManager] Registered provider: ${config.name}`);
  }

  /**
   * Get provider configuration by name
   * Delegates to ProviderRegistry
   */
  get(name: string): ProviderConfig | null {
    return providerRegistry.get(name);
  }

  /**
   * Check if provider exists
   * Delegates to ProviderRegistry
   */
  has(name: string): boolean {
    return providerRegistry.has(name);
  }

  /**
   * List all registered provider names
   * Delegates to ProviderRegistry
   */
  list(): string[] {
    return providerRegistry.list();
  }

  /**
   * Get provider instance by name
   * Delegates to ProviderRegistry
   */
  getProvider(name: string): LLMProvider | null {
    return providerRegistry.getProvider(name);
  }

  /**
   * Get API key for a provider
   * Delegates to ProviderRegistry
   */
  getProviderApiKey(providerName: string): string | null {
    return providerRegistry.getProviderApiKey(providerName);
  }

  /**
   * Unregister a provider
   * Delegates to ProviderRegistry
   */
  unregister(name: string): boolean {
    return providerRegistry.unregister(name);
  }

  /**
   * Clear all providers (useful for testing)
   * Delegates to ProviderRegistry
   */
  clear(): void {
    providerRegistry.clear();
  }

  /**
   * Get all provider configurations (useful for testing)
   * Delegates to ProviderRegistry
   */
  getAllConfigs(): ProviderConfig[] {
    return providerRegistry.getAllConfigs();
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
