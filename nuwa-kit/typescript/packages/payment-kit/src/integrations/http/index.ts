// Main exports
export { PaymentChannelHttpClient } from './PaymentChannelHttpClient';
export { PaymentChannelAdminClient, createAdminClient } from './PaymentChannelAdminClient';

// Types
export type {
  HttpPayerOptions,
  HostChannelMappingStore,
  FetchLike,
  HttpClientState,
  PaymentRequestContext,
} from './types';

// Store implementations
export {
  MemoryHostChannelMappingStore,
  LocalStorageHostChannelMappingStore,
  createDefaultMappingStore,
  extractHost,
} from './internal/LocalStore';

// Utilities
export { DidAuthHelper } from './internal/DidAuthHelper';

// Factory functions (recommended: use createHttpClient with IdentityEnv)
export { createHttpClient } from './factory';
export type { CreateHttpClientOptions } from './factory';
