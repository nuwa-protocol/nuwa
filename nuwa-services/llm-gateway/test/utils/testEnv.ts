import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

/**
 * Environment variable configuration for testing
 */
export interface TestEnvConfig {
  openaiApiKey?: string;
  openrouterApiKey?: string;
  litellmApiKey?: string;
  litellmBaseUrl?: string;
  skipIntegrationTests?: boolean;
}

/**
 * Provider test configuration
 */
export interface ProviderTestConfig {
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  reason?: string; // Why it's disabled
}

/**
 * Test environment utilities for integration tests
 */
export class TestEnv {
  private static config: TestEnvConfig | null = null;

  /**
   * Load and validate test environment configuration
   */
  static getConfig(): TestEnvConfig {
    if (this.config) {
      return this.config;
    }

    this.config = {
      openaiApiKey: process.env.OPENAI_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      litellmApiKey: process.env.LITELLM_API_KEY,
      litellmBaseUrl: process.env.LITELLM_BASE_URL,
      skipIntegrationTests: process.env.SKIP_INTEGRATION_TESTS === 'true',
    };

    return this.config;
  }

  /**
   * Check if integration tests should be skipped globally
   */
  static shouldSkipIntegrationTests(): boolean {
    const config = this.getConfig();
    return config.skipIntegrationTests || false;
  }

  /**
   * Get provider test configurations
   */
  static getProviderConfigs(): ProviderTestConfig[] {
    const config = this.getConfig();
    
    return [
      {
        name: 'openai',
        enabled: !!config.openaiApiKey,
        apiKey: config.openaiApiKey,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
        reason: !config.openaiApiKey ? 'OPENAI_API_KEY not configured' : undefined,
      },
      {
        name: 'openrouter',
        enabled: !!config.openrouterApiKey,
        apiKey: config.openrouterApiKey,
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai',
        reason: !config.openrouterApiKey ? 'OPENROUTER_API_KEY not configured' : undefined,
      },
      {
        name: 'litellm',
        enabled: !!config.litellmApiKey && !!config.litellmBaseUrl,
        apiKey: config.litellmApiKey,
        baseUrl: config.litellmBaseUrl,
        reason: (!config.litellmApiKey || !config.litellmBaseUrl) 
          ? 'LITELLM_API_KEY or LITELLM_BASE_URL not configured' 
          : undefined,
      },
    ];
  }

  /**
   * Get enabled provider configurations
   */
  static getEnabledProviders(): ProviderTestConfig[] {
    return this.getProviderConfigs().filter(p => p.enabled);
  }

  /**
   * Get disabled provider configurations
   */
  static getDisabledProviders(): ProviderTestConfig[] {
    return this.getProviderConfigs().filter(p => !p.enabled);
  }

  /**
   * Check if a specific provider is enabled for testing
   */
  static isProviderEnabled(providerName: string): boolean {
    const provider = this.getProviderConfigs().find(p => p.name === providerName);
    return provider?.enabled || false;
  }

  /**
   * Get API key for a specific provider
   */
  static getProviderApiKey(providerName: string): string | undefined {
    const provider = this.getProviderConfigs().find(p => p.name === providerName);
    return provider?.apiKey;
  }

  /**
   * Get base URL for a specific provider
   */
  static getProviderBaseUrl(providerName: string): string | undefined {
    const provider = this.getProviderConfigs().find(p => p.name === providerName);
    return provider?.baseUrl;
  }

  /**
   * Create a Jest describe block that conditionally skips based on provider availability
   */
  static describeProvider(providerName: string, testFn: () => void): void {
    const provider = this.getProviderConfigs().find(p => p.name === providerName);
    
    if (this.shouldSkipIntegrationTests()) {
      describe.skip(`${providerName} Provider Integration Tests (SKIP_INTEGRATION_TESTS=true)`, testFn);
    } else if (!provider?.enabled) {
      describe.skip(`${providerName} Provider Integration Tests (${provider?.reason || 'disabled'})`, testFn);
    } else {
      describe(`${providerName} Provider Integration Tests`, testFn);
    }
  }

  /**
   * Create a Jest test that conditionally skips based on provider availability
   */
  static testProvider(providerName: string, testName: string, testFn: () => void | Promise<void>): void {
    const provider = this.getProviderConfigs().find(p => p.name === providerName);
    
    if (this.shouldSkipIntegrationTests()) {
      it.skip(`${testName} (SKIP_INTEGRATION_TESTS=true)`, testFn);
    } else if (!provider?.enabled) {
      it.skip(`${testName} (${provider?.reason || 'disabled'})`, testFn);
    } else {
      it(testName, testFn);
    }
  }

  /**
   * Log test environment status
   */
  static logStatus(): void {
    console.log('\n🧪 Test Environment Status:');
    console.log(`   Skip Integration Tests: ${this.shouldSkipIntegrationTests()}`);
    
    const enabled = this.getEnabledProviders();
    const disabled = this.getDisabledProviders();
    
    if (enabled.length > 0) {
      console.log(`   Enabled Providers: ${enabled.map(p => p.name).join(', ')}`);
    }
    
    if (disabled.length > 0) {
      console.log(`   Disabled Providers: ${disabled.map(p => `${p.name} (${p.reason})`).join(', ')}`);
    }
    
    console.log('');
  }

  /**
   * Validate that required environment variables are set for enabled providers
   */
  static validateEnvironment(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = this.getConfig();

    // Check for common issues
    if (!config.skipIntegrationTests) {
      const enabledProviders = this.getEnabledProviders();
      
      if (enabledProviders.length === 0) {
        errors.push('No providers are enabled for testing. Set API keys or SKIP_INTEGRATION_TESTS=true');
      }

      // Validate LiteLLM specific requirements
      const litellm = enabledProviders.find(p => p.name === 'litellm');
      if (litellm && !config.litellmBaseUrl) {
        errors.push('LiteLLM is enabled but LITELLM_BASE_URL is not configured');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Reset configuration (useful for testing)
   */
  static reset(): void {
    this.config = null;
  }
}

/**
 * Helper function to create a test suite that respects environment configuration
 */
export function createProviderTestSuite(providerName: string, testFn: () => void): void {
  TestEnv.describeProvider(providerName, testFn);
}

/**
 * Helper function to create a test that respects environment configuration
 */
export function createProviderTest(providerName: string, testName: string, testFn: () => void | Promise<void>): void {
  TestEnv.testProvider(providerName, testName, testFn);
}
