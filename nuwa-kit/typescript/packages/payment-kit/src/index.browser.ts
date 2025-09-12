// Browser bundle entry: export only isomorphic + browser-safe modules

// Core types and utilities
export * from './core/types';
export * from './core/SubRav';
// Legacy ClaimScheduler export removed in favor of reactive claims
export * from './core/PaymentProcessor';
export * from './core/PaymentUtils';

// Contract interfaces
export * from './contracts/IPaymentChannelContract';

// Chain-agnostic clients
export * from './client/PaymentChannelPayerClient';
export * from './client/PaymentChannelPayeeClient';
export * from './client/PaymentHubClient';

// Factory for creating clients
export * from './factory/chainFactory';

// HTTP codec and middleware (browser-safe parts)
export { HttpPaymentCodec } from './middlewares/http/HttpPaymentCodec';
export { HttpBillingMiddleware } from './middlewares/http/HttpBillingMiddleware';

// Rooch implementation (rooch-sdk is browser-compatible)
export * from './rooch/RoochPaymentChannelContract';

// HTTP Payer Client integration
export * from './integrations/http';

// MCP Client (browser-safe): only client-side MCP pieces
export * from './integrations/mcp';

// Storage: browser-safe exports (types, memory, IndexedDB, and factory)
export type {
  TransactionStore,
  TransactionRecord,
  TransactionStatus,
  PaymentSnapshot,
} from './storage/interfaces/TransactionStore';
export { MemoryTransactionStore } from './storage/memory/transaction.memory';
export { IndexedDBTransactionStore } from './storage/indexeddb/transactions.indexeddb';
export {
  createTransactionStore,
  type TransactionStoreOptions,
} from './storage/factories/createTransactionStore';

// Framework-agnostic API types and errors (data-only)
export * from './types/api';
export * from './errors';

// Zod schemas for validation and serialization (core/api)
export {
  PersistedHttpClientStateSchema,
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

// Utilities
export {
  generateNonce,
  extractFragment,
  isValidHex,
  formatAmount,
  generateChannelId,
  bigintToString,
  stringToBigint,
  formatUsdAmount,
  DebugLogger,
} from './utils';

// IdentityEnv helpers
export { getChainConfigFromEnv } from './helpers/fromIdentityEnv';
