/**
 * Factory function for creating PendingSubRAVRepository instances
 */

import type { Pool } from 'pg';
import type { PendingSubRAVRepository } from '../interfaces/PendingSubRAVRepository';
import { MemoryPendingSubRAVRepository } from '../memory/pendingSubRav.memory';
import { IndexedDBPendingSubRAVRepository } from '../indexeddb/pendingSubRav.indexeddb';
import { SqlPendingSubRAVRepository, type SqlPendingSubRAVRepositoryOptions } from '../sql/pendingSubRav.sql';

export interface PendingSubRAVRepositoryOptions {
  /** Backend type to use */
  backend?: 'memory' | 'indexeddb' | 'sql';
  /** Database connection string for SQL backends */
  connectionString?: string;
  /** PostgreSQL connection pool (alternative to connectionString) */
  pool?: Pool;
  /** Table name prefix for SQL backends */
  tablePrefix?: string;
  /** Auto-create tables if they don't exist */
  autoMigrate?: boolean;
  /** Allow unsafe auto-migration in production */
  allowUnsafeAutoMigrateInProd?: boolean;
}

/**
 * Create a PendingSubRAVRepository instance based on the specified backend
 */
export function createPendingSubRAVRepo(options: PendingSubRAVRepositoryOptions = {}): PendingSubRAVRepository {
  const { backend = 'memory' } = options;

  switch (backend) {
    case 'memory':
      return new MemoryPendingSubRAVRepository();

    case 'indexeddb':
      if (typeof window === 'undefined' || !window.indexedDB) {
        throw new Error('IndexedDB is not available in this environment');
      }
      return new IndexedDBPendingSubRAVRepository();

    case 'sql':
      if (!options.pool) {
        throw new Error('SQL backend requires a PostgreSQL connection pool');
      }
      
      const sqlOptions: SqlPendingSubRAVRepositoryOptions = {
        pool: options.pool,
        tablePrefix: options.tablePrefix,
        autoMigrate: options.autoMigrate,
        allowUnsafeAutoMigrateInProd: options.allowUnsafeAutoMigrateInProd,
      };
      
      return new SqlPendingSubRAVRepository(sqlOptions);

    default:
      throw new Error(`Unknown backend type: ${backend}`);
  }
}

/**
 * Auto-detect the best available backend for the current environment
 */
export function createPendingSubRAVRepoAuto(options: Omit<PendingSubRAVRepositoryOptions, 'backend'> = {}): PendingSubRAVRepository {
  // If pool is provided, use SQL
  if (options.pool) {
    return createPendingSubRAVRepo({ ...options, backend: 'sql' });
  }

  // If in browser and IndexedDB is available, use IndexedDB
  if (typeof window !== 'undefined' && window.indexedDB) {
    return createPendingSubRAVRepo({ ...options, backend: 'indexeddb' });
  }

  // Fallback to memory
  return createPendingSubRAVRepo({ ...options, backend: 'memory' });
} 