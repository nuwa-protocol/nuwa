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
export {
  createChannelRepo,
  createChannelRepoAuto,
  type ChannelRepositoryOptions,
} from './factories/createChannelRepo';

export {
  createRAVRepo,
  createRAVRepoAuto,
  type RAVRepositoryOptions,
} from './factories/createRAVRepo';

export {
  createPendingSubRAVRepo,
  createPendingSubRAVRepoAuto,
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
export { 
  SqlChannelRepository,
  type SqlChannelRepositoryOptions,
} from './sql/channel.sql';
export { 
  SqlRAVRepository,
  type SqlRAVRepositoryOptions,
} from './sql/rav.sql';
export { 
  SqlPendingSubRAVRepository,
  type SqlPendingSubRAVRepositoryOptions,
} from './sql/pendingSubRav.sql';

// SQL serialization utilities
export {
  encodeSignedSubRAV,
  decodeSignedSubRAV,
  encodeSubRAVBCS,
  getSubRAVHex,
} from './sql/serialization';

// ==================== Convenience Functions ====================

import { 
  createChannelRepo as _createChannelRepo,
  createChannelRepoAuto as _createChannelRepoAuto 
} from './factories/createChannelRepo';
import { 
  createRAVRepo as _createRAVRepo,
  createRAVRepoAuto as _createRAVRepoAuto 
} from './factories/createRAVRepo';
import { 
  createPendingSubRAVRepo as _createPendingSubRAVRepo,
  createPendingSubRAVRepoAuto as _createPendingSubRAVRepoAuto 
} from './factories/createPendingSubRAVRepo';

/**
 * Create all repositories with the same backend configuration
 */
export function createStorageRepositories(options: {
  backend?: 'memory' | 'indexeddb' | 'sql';
  pool?: any; // Pool from 'pg'
  tablePrefix?: string;
  autoMigrate?: boolean;
}) {
  return {
    channelRepo: _createChannelRepo(options),
    ravRepo: _createRAVRepo(options),
    pendingSubRAVRepo: _createPendingSubRAVRepo(options),
  };
}

/**
 * Auto-detect and create all repositories with optimal backend for current environment
 */
export function createStorageRepositoriesAuto(options: {
  pool?: any; // Pool from 'pg'
  tablePrefix?: string;
  autoMigrate?: boolean;
} = {}) {
  return {
    channelRepo: _createChannelRepoAuto(options),
    ravRepo: _createRAVRepoAuto(options),
    pendingSubRAVRepo: _createPendingSubRAVRepoAuto(options),
  };
}