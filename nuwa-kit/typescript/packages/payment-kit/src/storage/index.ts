/**
 * Payment Kit Storage Layer
 *
 * Unified storage abstractions for channels, RAVs, and pending SubRAVs
 * with support for multiple backends (memory, IndexedDB, SQL)
 */

// ==================== Type Exports ====================
export type {
  PaginationParams,
  PaginatedResult,
  ChannelFilter,
  CacheStats,
  PendingSubRAVStats,
} from './types/pagination';

// ==================== Interface Exports ====================
export type { ChannelRepository } from './interfaces/ChannelRepository';
export type { RAVRepository } from './interfaces/RAVRepository';
export type { PendingSubRAVRepository } from './interfaces/PendingSubRAVRepository';

// ==================== Factory Function Exports ====================
export { createChannelRepo, type ChannelRepositoryOptions } from './factories/createChannelRepo';

export { createRAVRepo, type RAVRepositoryOptions } from './factories/createRAVRepo';

export {
  createPendingSubRAVRepo,
  type PendingSubRAVRepositoryOptions,
} from './factories/createPendingSubRAVRepo';

// ==================== Implementation Exports (Optional) ====================
// Export implementations for advanced use cases or testing

// Memory implementations
export { MemoryChannelRepository } from './memory/channel.memory';
export { MemoryRAVRepository } from './memory/rav.memory';
export { MemoryPendingSubRAVRepository } from './memory/pendingSubRav.memory';

// IndexedDB implementations
export { IndexedDBChannelRepository } from './indexeddb/channel.indexeddb';
export { IndexedDBRAVRepository } from './indexeddb/rav.indexeddb';
export { IndexedDBPendingSubRAVRepository } from './indexeddb/pendingSubRav.indexeddb';

// SQL implementations
export { SqlChannelRepository, type SqlChannelRepositoryOptions } from './sql/channel.sql';
export { SqlRAVRepository, type SqlRAVRepositoryOptions } from './sql/rav.sql';
export {
  SqlPendingSubRAVRepository,
  type SqlPendingSubRAVRepositoryOptions,
} from './sql/pendingSubRav.sql';

// SQL serialization utilities
export { encodeSubRAV, decodeSubRAV, getSubRAVHex } from './sql/serialization';

// ==================== Transaction Store Exports ====================
export type {
  TransactionStore,
  TransactionRecord,
  TransactionStatus,
  PaymentSnapshot,
} from './interfaces/TransactionStore';
export { MemoryTransactionStore } from './memory/transaction.memory';
export { IndexedDBTransactionStore } from './indexeddb/transactions.indexeddb';
export {
  createTransactionStore,
  type TransactionStoreOptions,
} from './factories/createTransactionStore';

// ==================== Convenience Functions ====================

import { createChannelRepo as _createChannelRepo } from './factories/createChannelRepo';
import { createRAVRepo as _createRAVRepo } from './factories/createRAVRepo';
import { createPendingSubRAVRepo as _createPendingSubRAVRepo } from './factories/createPendingSubRAVRepo';

/**
 * Create all repositories with the same backend configuration
 */
export function createStorageRepositories(options: {
  backend?: 'memory' | 'indexeddb' | 'sql';
  pool?: any; // Pool from 'pg'
  connectionString?: string; // e.g., SUPABASE_DB_URL
  tablePrefix?: string;
  autoMigrate?: boolean;
}) {
  const opts: any = { ...options };
  // Note: keep this module browser-safe; do not load 'pg' here.
  return {
    channelRepo: _createChannelRepo(opts),
    ravRepo: _createRAVRepo(opts),
    pendingSubRAVRepo: _createPendingSubRAVRepo(opts),
  };
}
