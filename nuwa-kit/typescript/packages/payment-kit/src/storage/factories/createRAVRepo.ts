/**
 * Factory function for creating RAVRepository instances
 */

import type { Pool } from 'pg';
import type { RAVRepository } from '../interfaces/RAVRepository';
import { MemoryRAVRepository } from '../memory/rav.memory';
import { IndexedDBRAVRepository } from '../indexeddb/rav.indexeddb';
// import { SqlRAVRepository } from '../sql/rav.sql'; // Temporarily commented out

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
}

/**
 * Create a RAVRepository instance based on the specified backend
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
      // Temporarily disabled
      throw new Error('SQL backend is temporarily disabled');

    default:
      throw new Error(`Unknown backend type: ${backend}`);
  }
}

/**
 * Auto-detect the best available backend for the current environment
 */
export function createRAVRepoAuto(options: Omit<RAVRepositoryOptions, 'backend'> = {}): RAVRepository {
  // If pool is provided, use SQL
  if (options.pool) {
    return createRAVRepo({ ...options, backend: 'sql' });
  }

  // If in browser and IndexedDB is available, use IndexedDB
  if (typeof window !== 'undefined' && window.indexedDB) {
    return createRAVRepo({ ...options, backend: 'indexeddb' });
  }

  // Fallback to memory
  return createRAVRepo({ ...options, backend: 'memory' });
} 