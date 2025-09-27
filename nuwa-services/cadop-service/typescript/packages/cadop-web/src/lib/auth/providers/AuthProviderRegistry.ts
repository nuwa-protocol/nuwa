import { AuthMethod } from '../../storage/types';
import { AuthProvider, AuthProviderFactory, AuthProviderRegistry } from './types';

/**
 * Default implementation of AuthProviderRegistry
 */
export class DefaultAuthProviderRegistry implements AuthProviderRegistry {
  private providers = new Map<AuthMethod, AuthProviderFactory>();
  private instances = new Map<AuthMethod, AuthProvider>();

  /**
   * Register an authentication provider
   */
  register(method: AuthMethod, factory: AuthProviderFactory): void {
    this.providers.set(method, factory);
    // Clear cached instance when re-registering
    this.instances.delete(method);
  }

  /**
   * Get authentication provider instance
   */
  async get(method: AuthMethod): Promise<AuthProvider> {
    // Return cached instance if available
    if (this.instances.has(method)) {
      return this.instances.get(method)!;
    }

    // Create new instance
    const factory = this.providers.get(method);
    if (!factory) {
      throw new Error(`[AuthProviderRegistry] No provider registered for method: ${method}`);
    }

    const provider = await factory();
    this.instances.set(method, provider);
    return provider;
  }

  /**
   * Check if a provider is registered for the given method
   */
  isRegistered(method: AuthMethod): boolean {
    return this.providers.has(method);
  }

  /**
   * Get all supported authentication methods
   */
  async getSupportedMethods(): Promise<AuthMethod[]> {
    const supportedMethods: AuthMethod[] = [];

    for (const method of this.providers.keys()) {
      try {
        const provider = await this.get(method);
        const isSupported = await provider.isSupported();

        if (isSupported) {
          supportedMethods.push(method);
        }
      } catch (error) {
        console.warn(`[AuthProviderRegistry] Failed to check support for ${method}:`, error);
      }
    }

    return supportedMethods;
  }

  /**
   * Clear all cached instances
   */
  clearCache(): void {
    this.instances.clear();
  }
}

/**
 * Global registry instance
 */
export const authProviderRegistry = new DefaultAuthProviderRegistry();
