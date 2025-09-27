import { VDRRegistry, createVDR } from '@nuwa-ai/identity-kit';
import { ROOCH_RPC_URL } from '@/config/env';

/**
 * Centralized VDR Manager
 *
 * This service provides a single point of control for VDR initialization
 * and ensures that VDRs are only created once and reused across the application.
 */
export class VDRManager {
  private static instance: VDRManager;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): VDRManager {
    if (!VDRManager.instance) {
      VDRManager.instance = new VDRManager();
    }
    return VDRManager.instance;
  }

  /**
   * Initialize all required VDRs
   * This method is idempotent - it can be called multiple times safely
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this._doInitialize();
    await this.initializationPromise;
  }

  /**
   * Internal initialization logic
   */
  private async _doInitialize(): Promise<void> {
    try {
      const registry = VDRRegistry.getInstance();

      // Initialize Rooch VDR if not already registered
      if (!registry.getVDR('rooch')) {
        console.info('[VDRManager] Initializing Rooch VDR with RPC:', ROOCH_RPC_URL);

        const roochVDR = createVDR('rooch', {
          rpcUrl: ROOCH_RPC_URL,
          debug: import.meta.env.DEV,
        });

        registry.registerVDR(roochVDR);
        console.info('[VDRManager] Rooch VDR initialized successfully');
      } else {
        console.debug('[VDRManager] Rooch VDR already registered');
      }

      // Add other VDRs here as needed in the future
      // Example:
      // if (!registry.getVDR('ethereum')) {
      //   const ethereumVDR = createVDR('ethereum', { ... });
      //   registry.registerVDR(ethereumVDR);
      // }

      this.initialized = true;
      console.info('[VDRManager] All VDRs initialized successfully');
    } catch (error) {
      console.error('[VDRManager] Failed to initialize VDRs:', error);
      // Reset state so initialization can be retried
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get the VDR registry instance
   */
  getRegistry(): VDRRegistry {
    return VDRRegistry.getInstance();
  }

  /**
   * Check if VDRs are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure Rooch VDR is available
   * This is a convenience method for components that specifically need Rooch VDR
   */
  async ensureRoochVDR(): Promise<void> {
    await this.initialize();

    const registry = VDRRegistry.getInstance();
    if (!registry.getVDR('rooch')) {
      throw new Error('Rooch VDR is not available after initialization');
    }
  }

  /**
   * Reset the manager (mainly for testing)
   */
  reset(): void {
    this.initialized = false;
    this.initializationPromise = null;
  }
}

/**
 * Convenience function to get the VDR manager instance
 */
export function getVDRManager(): VDRManager {
  return VDRManager.getInstance();
}

/**
 * Convenience function to ensure VDRs are initialized
 */
export async function ensureVDRInitialized(): Promise<void> {
  await VDRManager.getInstance().initialize();
}

/**
 * Convenience function to get the VDR registry
 */
export function getVDRRegistry(): VDRRegistry {
  return VDRManager.getInstance().getRegistry();
}
