/**
 * Web-specific functionality for @nuwa-ai/identity-kit
 *
 * This module provides browser-specific implementations including:
 * - LocalStorage and IndexedDB KeyStore implementations
 * - DeepLink management for CADOP integration
 * - High-level IdentityKitWeb API
 * - React hooks (when React is available)
 *
 * Note: All exports include runtime environment checks to ensure
 * they only work in appropriate environments (browser for web features,
 * React available for hooks, etc.)
 */

// Always export types for better TypeScript support
export type { IdentityKitWebOptions } from './IdentityKitWeb';
export type { ConnectOptions, AuthResult } from './deeplink/DeepLinkManager';
export type {
  IdentityKitState,
  IdentityKitHook,
  UseIdentityKitOptions,
} from './react/useIdentityKit';

// Re-export core functionality
export { VDRRegistry } from '../index';

// KeyStore implementations (with runtime browser checks)
export { LocalStorageKeyStore } from './keystore/LocalStorageKeyStore';
export { IndexedDBKeyStore } from './keystore/IndexedDBKeyStore';

// DeepLink functionality (with runtime browser checks)
export { DeepLinkManager } from './deeplink/DeepLinkManager';

// Main IdentityKitWeb class (with runtime browser checks)
export { IdentityKitWeb } from './IdentityKitWeb';

// React hooks (with runtime React availability checks)
export { useIdentityKit } from './react/useIdentityKit';

// Create registry instance
import { VDRRegistry } from '../index';
export const registry = VDRRegistry.getInstance();
