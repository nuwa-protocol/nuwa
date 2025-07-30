/**
 * SQL-based PendingSubRAVRepository implementation for PostgreSQL/Supabase
 */

import type { Pool, PoolClient } from 'pg';
import { encodeSubRAV, decodeSubRAV } from './serialization';
import type { PendingSubRAVRepository } from '../interfaces/PendingSubRAVRepository';
import type { SubRAV } from '../../core/types';
import type { PendingSubRAVStats } from '../types/pagination';

export interface SqlPendingSubRAVRepositoryOptions {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Table name prefix (default: 'nuwa_') */
  tablePrefix?: string;
  /** Auto-create tables if they don't exist */
  autoMigrate?: boolean;
  /** Allow unsafe auto-migration in production */
  allowUnsafeAutoMigrateInProd?: boolean;
}

/**
 * PostgreSQL/Supabase implementation of PendingSubRAVRepository
 */
export class SqlPendingSubRAVRepository implements PendingSubRAVRepository {
  private pool: Pool;
  private tablePrefix: string;
  private autoMigrate: boolean;
  private allowUnsafeAutoMigrateInProd: boolean;

  constructor(options: SqlPendingSubRAVRepositoryOptions) {
    this.pool = options.pool;
    this.tablePrefix = options.tablePrefix || 'nuwa_';
    this.autoMigrate = options.autoMigrate ?? true;
    this.allowUnsafeAutoMigrateInProd = options.allowUnsafeAutoMigrateInProd ?? false;
    
    // Only auto-migrate in development or when explicitly allowed in production
    if (this.autoMigrate && (process.env.NODE_ENV !== 'production' || this.allowUnsafeAutoMigrateInProd)) {
      this.initialize().catch(console.error);
    }
  }

  private get pendingSubRAVsTable(): string {
    return `${this.tablePrefix}pending_sub_ravs`;
  }

  /**
   * Initialize database tables if they don't exist
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create pending SubRAVs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.pendingSubRAVsTable} (
          channel_id        TEXT NOT NULL,
          nonce            NUMERIC(78,0) NOT NULL,
          sub_rav_bcs      BYTEA NOT NULL,
          created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY(channel_id, nonce)
        )
      `);

      // Create index for cleanup operations
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}pending_sub_ravs_created_at 
        ON ${this.pendingSubRAVsTable}(created_at)
      `);

    } finally {
      client.release();
    }
  }

  async save(subRAV: SubRAV): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Encode SubRAV using BCS serialization
      const subRavBcs = encodeSubRAV(subRAV);
      
      await client.query(`
        INSERT INTO ${this.pendingSubRAVsTable} 
        (channel_id, nonce, sub_rav_bcs)
        VALUES ($1, $2, $3)
        ON CONFLICT (channel_id, nonce) 
        DO UPDATE SET 
          sub_rav_bcs = EXCLUDED.sub_rav_bcs,
          created_at = NOW()
      `, [
        subRAV.channelId,
        subRAV.nonce.toString(),
        subRavBcs
      ]);
    } finally {
      client.release();
    }
  }

  async find(channelId: string, nonce: bigint): Promise<SubRAV | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT sub_rav_bcs 
        FROM ${this.pendingSubRAVsTable}
        WHERE channel_id = $1 AND nonce = $2
      `, [channelId, nonce.toString()]);

      if (result.rows.length === 0) {
        return null;
      }

      const subRavBcs = result.rows[0].sub_rav_bcs as Buffer;
      return decodeSubRAV(subRavBcs);
    } finally {
      client.release();
    }
  }

  async remove(channelId: string, nonce: bigint): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        DELETE FROM ${this.pendingSubRAVsTable} 
        WHERE channel_id = $1 AND nonce = $2
      `, [channelId, nonce.toString()]);
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired pending SubRAVs
   * 
   * Note: This method uses database server time (NOW()) instead of client time
   * to avoid issues with time drift between client and database server.
   * This ensures that cleanup works correctly even when client and server
   * clocks are not perfectly synchronized.
   * 
   * @param maxAgeMs Maximum age in milliseconds (default: 30 minutes)
   * @returns Number of records deleted
   */
  async cleanup(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Use database server time to avoid client-server time drift issues
      const result = await client.query(`
        DELETE FROM ${this.pendingSubRAVsTable} 
        WHERE created_at < NOW() - (make_interval(secs => $1 / 1000))
      `, [maxAgeMs]);

      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  async getStats(): Promise<PendingSubRAVStats> {
    const client = await this.pool.connect();
    try {
      // Get total count
      const totalResult = await client.query(`
        SELECT COUNT(*) as total_count FROM ${this.pendingSubRAVsTable}
      `);
      const totalCount = parseInt(totalResult.rows[0].total_count);

      // Get count by channel
      const byChannelResult = await client.query(`
        SELECT channel_id, COUNT(*) as count 
        FROM ${this.pendingSubRAVsTable}
        GROUP BY channel_id
      `);
      
      const byChannel: Record<string, number> = {};
      for (const row of byChannelResult.rows) {
        byChannel[row.channel_id] = parseInt(row.count);
      }

      // Get oldest and newest timestamps
      const timestampResult = await client.query(`
        SELECT 
          MIN(EXTRACT(EPOCH FROM created_at) * 1000) as oldest,
          MAX(EXTRACT(EPOCH FROM created_at) * 1000) as newest
        FROM ${this.pendingSubRAVsTable}
      `);
      
      const oldestTimestamp = timestampResult.rows[0].oldest ? parseInt(timestampResult.rows[0].oldest) : undefined;
      const newestTimestamp = timestampResult.rows[0].newest ? parseInt(timestampResult.rows[0].newest) : undefined;

      return {
        totalCount,
        byChannel,
        oldestTimestamp,
        newestTimestamp,
      };
    } finally {
      client.release();
    }
  }

  async clear(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`DELETE FROM ${this.pendingSubRAVsTable}`);
    } finally {
      client.release();
    }
  }
} 