// Main exports
export { PaymentChannelHttpClient } from './PaymentChannelHttpClient';

// Types
export type {
  HttpPayerOptions,
  HostChannelMappingStore,
  FetchLike,
  HttpClientState,
  PaymentRequestContext
} from './types';

// Store implementations
export {
  MemoryHostChannelMappingStore,
  LocalStorageHostChannelMappingStore,
  createDefaultMappingStore,
  extractHost
} from './internal/HostChannelMappingStore';

// Utilities
export { DidAuthHelper } from './internal/DidAuthHelper';
export { SubRAVCache } from './internal/SubRAVCache';

// Factory functions
export { 
  createHttpPayerClient, 
  createMultipleHttpPayerClients 
} from './factory';
export type { CreateHttpPayerClientOptions } from './factory';

// IdentityEnv integration
export { createHttpClientFromEnv } from './fromIdentityEnv';