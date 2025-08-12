/**
 * Factory function for creating RAV repositories
 */

import type { Pool } from 'pg';
import type { RAVRepository } from '../interfaces/RAVRepository';
import { MemoryRAVRepository } from '../memory/rav.memory';
import { IndexedDBRAVRepository } from '../indexeddb/rav.indexeddb';
import { SqlRAVRepository, type SqlRAVRepositoryOptions } from '../sql/rav.sql';

export interface RAVRepositoryOptions {
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
 * Create a RAV repository instance based on the specified backend
 */
export function createRAVRepo(options: RAVRepositoryOptions = {}): RAVRepository {
  const { backend = 'memory' } = options;

  switch (backend) {
    case 'memory':
      return new MemoryRAVRepository();

    case 'indexeddb':
      if (typeof window === 'undefined' || !window.indexedDB) {
        throw new Error('IndexedDB is not available in this environment');
      }
      return new IndexedDBRAVRepository();

    case 'sql':
      // Do not create pool here; caller must provide a Pool (Node-only)
      if (!options.pool) {
        throw new Error('SQL backend requires a PostgreSQL connection pool');
      }

      const sqlOptions: SqlRAVRepositoryOptions = {
        pool: options.pool,
        tablePrefix: options.tablePrefix,
        autoMigrate: options.autoMigrate,
        allowUnsafeAutoMigrateInProd: options.allowUnsafeAutoMigrateInProd,
      };

      return new SqlRAVRepository(sqlOptions);

    default:
      throw new Error(`Unknown backend type: ${backend}`);
  }
}
