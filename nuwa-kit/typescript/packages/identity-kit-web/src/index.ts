import { VDRRegistry } from '@nuwa-ai/identity-kit';

// KeyStore implementations
export * from './keystore';

// DeepLink
export * from './deeplink';

// NuwaIdentityKitWeb
export { NuwaIdentityKitWeb } from './NuwaIdentityKitWeb';

// React hooks (optional)
export * from './react';

export { VDRRegistry } from '@nuwa-ai/identity-kit';
export const registry = VDRRegistry.getInstance();