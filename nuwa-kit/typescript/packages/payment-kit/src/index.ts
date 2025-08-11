import type { IdentityKit } from '@nuwa-ai/identity-kit';
import { VDRRegistry } from '@nuwa-ai/identity-kit';

// Core types and utilities
export * from './core/types';
export * from './core/SubRav';
export * from './core/ClaimScheduler';

// Payment processor architecture
export * from './core/PaymentProcessor';
export * from './core/PaymentUtils';


// Payment codecs
// export * from './codecs/PaymentCodec';

// Contract interfaces
export * from './contracts/IPaymentChannelContract';

// Chain-agnostic clients
export * from './client/PaymentChannelPayerClient';
export * from './client/PaymentChannelPayeeClient';
export * from './client/PaymentHubClient';

// Factory for creating clients
export * from './factory/chainFactory';

// Modern storage layer - refactored architecture
export * from './storage';

// HTTP billing middleware (new refactored version)
export * from './middlewares/http/HttpBillingMiddleware';

// Rooch implementation
export * from './rooch/RoochPaymentChannelContract';

// Core SubRAV utilities for advanced use cases
export { 
  SubRAVSigner, 
  SubRAVCodec, 
  SubRAVUtils, 
  SubRAVValidator, 
  SubRAVSchema,
  CURRENT_SUBRAV_VERSION, 
  SUBRAV_VERSION_1 
} from './core/SubRav';

// HTTP Transport
export { HttpPaymentCodec } from './middlewares/http/HttpPaymentCodec';

// HTTP Billing middleware for deferred payment model (refactored)
export { HttpBillingMiddleware } from './middlewares/http/HttpBillingMiddleware';

// Billing system (excluding conflicting types)
export * from './billing';

// Utility functions
export { 
  generateNonce, 
  extractFragment, 
  isValidHex, 
  formatAmount,
  generateChannelId,
  bigintToString,
  stringToBigint,
  DebugLogger 
} from './utils';

// HTTP Payer Client integration
export * from './integrations/http';

// Express Payment Kit integration (legacy path - deprecated)
export * from './integrations/express';

// New transport layer (recommended)
export * from './transport/express';

// Framework-agnostic API handlers and types
export * from './api';
export * from './types/api';
export * from './errors';

// Zod schemas for validation and serialization (avoiding duplicates)
export { 
  // Core schemas only for serialization
  PersistedHttpClientStateSchema,
  // Other essential schemas not conflicting with core types
  ServiceDiscoverySchema,
  ClaimsStatusSchema,
  ClaimTriggerRequestSchema,
  ClaimTriggerResponseSchema,
  CleanupRequestSchema,
  CleanupResponseSchema,
  RecoveryRequestSchema,
  RecoveryResponseSchema,
  CommitRequestSchema,
  CommitResponseSchema,
  HealthRequestSchema,
  HealthResponseSchema,
  SubRavRequestSchema,
  SubRavQueryResponseSchema,
  AdminRequestSchema,
  ClaimsStatusResponseSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
} from './schema';
// Note: PersistedHttpClientState type is exported via integrations/http

// Core IdentityEnv integration helpers (shared utilities)
export { getChainConfigFromEnv } from './helpers/fromIdentityEnv';