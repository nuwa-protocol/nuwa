/**
 * Factory function for creating ChannelRepository instances
 */

import type { Pool } from 'pg';
import type { ChannelRepository } from '../interfaces/ChannelRepository';
import { MemoryChannelRepository } from '../memory/channel.memory';
import { IndexedDBChannelRepository } from '../indexeddb/channel.indexeddb';
// import { SqlChannelRepository } from '../sql/channel.sql'; // Temporarily commented out

export interface ChannelRepositoryOptions {
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
 * Create a ChannelRepository instance based on the specified backend
 */
export function createChannelRepo(options: ChannelRepositoryOptions = {}): ChannelRepository {
  const { backend = 'memory' } = options;

  switch (backend) {
    case 'memory':
      return new MemoryChannelRepository();

    case 'indexeddb':
      if (typeof window === 'undefined' || !window.indexedDB) {
        throw new Error('IndexedDB is not available in this environment');
      }
      return new IndexedDBChannelRepository();

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
export function createChannelRepoAuto(options: Omit<ChannelRepositoryOptions, 'backend'> = {}): ChannelRepository {
  // If pool is provided, use SQL
  if (options.pool) {
    return createChannelRepo({ ...options, backend: 'sql' });
  }

  // If in browser and IndexedDB is available, use IndexedDB
  if (typeof window !== 'undefined' && window.indexedDB) {
    return createChannelRepo({ ...options, backend: 'indexeddb' });
  }

  // Fallback to memory
  return createChannelRepo({ ...options, backend: 'memory' });
} 