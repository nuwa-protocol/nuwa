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

// Factory functions (recommended: use createHttpClient with IdentityEnv)
export { 
  createHttpClient,
  createMultipleHttpClients,
  createHttpPayerClient, 
  createHttpPayerClientWithDiscovery,
  createMultipleHttpPayerClients 
} from './factory';
export type { 
  CreateHttpClientOptions,
  CreateHttpPayerClientOptions 
} from './factory';

// Note: createHttpClientFromEnv has been replaced by createHttpClient