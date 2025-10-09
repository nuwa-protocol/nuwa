import type { IdentityKit } from '@nuwa-ai/identity-kit';
import { VDRRegistry } from '@nuwa-ai/identity-kit';

// Core types and utilities
export * from './core/types';
export * from './core/SubRav';
// Legacy ClaimScheduler export removed; use ClaimTriggerService for reactive claims

// Payment processor architecture
export * from './core/PaymentProcessor';
export * from './core/PaymentUtils';

// Payment codecs
// export * from './codecs/PaymentCodec';

// Contract interfaces
export * from './contracts/IPaymentChannelContract';
export * from './contracts/IPaymentRevenueContract';

// Chain-agnostic clients
export * from './client/PaymentChannelPayerClient';
export * from './client/PaymentChannelPayeeClient';
export * from './client/PaymentHubClient';
export * from './client/PaymentRevenueClient';

// Factory for creating clients
export * from './factory/chainFactory';

// Modern storage layer - refactored architecture
export * from './storage';

// HTTP billing middleware (new refactored version)
export * from './middlewares/http/HttpBillingMiddleware';

// Rooch implementation
export * from './rooch/RoochPaymentChannelContract';
export * from './rooch/RoochPaymentRevenueContract';
export * from './rooch/RoochContractBase';

// Core SubRAV utilities for advanced use cases
export {
  SubRAVSigner,
  SubRAVCodec,
  SubRAVUtils,
  SubRAVBCSSchema,
  CURRENT_SUBRAV_VERSION,
  SUBRAV_VERSION_1,
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
  DebugLogger,
} from './utils';

// HTTP Payer Client integration
export * from './integrations/http';

// MCP Payer Client integration
export * from './integrations/mcp';

// Express Payment Kit integration (legacy path - deprecated)
export * from './integrations/express';

// New transport layer (recommended)
export * from './transport/express';
export * from './transport/mcp';

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
  SystemStatusSchema,
  ClaimTriggerRequestSchema,
  ClaimTriggerResponseSchema,
  RecoveryRequestSchema,
  RecoveryResponseSchema,
  CommitRequestSchema,
  CommitResponseSchema,
  HealthRequestSchema,
  HealthResponseSchema,
  SubRavRequestSchema,
  SubRavResponseSchema,
  AdminRequestSchema,
  SystemStatusResponseSchema,
  DiscoveryRequestSchema,
  DiscoveryResponseSchema,
} from './schema';
// Note: PersistedHttpClientState type is exported via integrations/http

// Core IdentityEnv integration helpers (shared utilities)
export { getChainConfigFromEnv } from './helpers/fromIdentityEnv';
