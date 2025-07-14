/**
 * SQL-based storage implementations for Payment Kit
 * Supports PostgreSQL (including Supabase)
 */

// Note: 'pg' is an optional dependency. Install with: npm install pg @types/pg
import type { Pool, PoolClient } from 'pg';
import { MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { RAVStore } from './storage';
import type { SignedSubRAV } from './types';

export interface SqlRAVStoreOptions {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Table name prefix (default: 'nuwa_') */
  tablePrefix?: string;
  /** Auto-create tables if they don't exist */
  autoMigrate?: boolean;
}

/**
 * PostgreSQL/Supabase implementation of RAVStore
 * 
 * Compatible with both self-hosted Postgres and Supabase
 * Uses standard SQL that works across both platforms
 */
export class SqlRAVStore implements RAVStore {
  private pool: Pool;
  private tablePrefix: string;
  private autoMigrate: boolean;

  constructor(options: SqlRAVStoreOptions) {
    this.pool = options.pool;
    this.tablePrefix = options.tablePrefix || 'nuwa_';
    this.autoMigrate = options.autoMigrate ?? true;
    
    if (this.autoMigrate) {
      this.initialize().catch(console.error);
    }
  }

  private get ravsTable(): string {
    return `${this.tablePrefix}ravs`;
  }

  private get claimsTable(): string {
    return `${this.tablePrefix}claims`;
  }

  /**
   * Initialize database tables if they don't exist
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create RAVs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.ravsTable} (
          id                SERIAL PRIMARY KEY,
          channel_id        TEXT NOT NULL,
          vm_id_fragment    TEXT NOT NULL,
          nonce             NUMERIC(78,0) NOT NULL,
          accumulated_amount NUMERIC(78,0) NOT NULL,
          rav_data          BYTEA NOT NULL,
          created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(channel_id, vm_id_fragment, nonce)
        )
      `);

      // Create index for efficient queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}ravs_channel 
        ON ${this.ravsTable}(channel_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}ravs_channel_vm 
        ON ${this.ravsTable}(channel_id, vm_id_fragment)
      `);

      // Create claims tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.claimsTable} (
          channel_id        TEXT NOT NULL,
          vm_id_fragment    TEXT NOT NULL,
          claimed_nonce     NUMERIC(78,0) NOT NULL,
          claimed_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          tx_hash          TEXT,
          PRIMARY KEY(channel_id, vm_id_fragment)
        )
      `);

    } finally {
      client.release();
    }
  }

  async save(rav: SignedSubRAV): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Encode RAV data as base64url for safe storage
      const ravDataEncoded = MultibaseCodec.encodeBase64url(JSON.stringify(rav));
      
      await client.query(
        `INSERT INTO ${this.ravsTable}(channel_id, vm_id_fragment, nonce, accumulated_amount, rav_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (channel_id, vm_id_fragment, nonce) DO NOTHING`,
        [
          rav.subRav.channelId,
          rav.subRav.vmIdFragment,
          rav.subRav.nonce.toString(),
          rav.subRav.accumulatedAmount.toString(),
          Buffer.from(ravDataEncoded),
        ]
      );
    } finally {
      client.release();
    }
  }

  async getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT rav_data FROM ${this.ravsTable}
         WHERE channel_id = $1 AND vm_id_fragment = $2
         ORDER BY nonce DESC LIMIT 1`,
        [channelId, vmIdFragment]
      );

      if (rows.length === 0) {
        return null;
      }

      const ravDataBuffer = rows[0].rav_data;
      const ravDataStr = ravDataBuffer instanceof Buffer ? ravDataBuffer.toString() : ravDataBuffer;
      const ravDataDecoded = MultibaseCodec.decodeBase64url(ravDataStr);
      return JSON.parse(ravDataDecoded);
    } finally {
      client.release();
    }
  }

  async *list(channelId: string): AsyncIterable<SignedSubRAV> {
    const client = await this.pool.connect();
    try {
      const cursor = client.query(
        `SELECT rav_data FROM ${this.ravsTable}
         WHERE channel_id = $1
         ORDER BY vm_id_fragment, nonce`,
        [channelId]
      );

      const result = await cursor;
      
      for (const row of result.rows) {
        const ravDataBuffer = row.rav_data;
        const ravDataStr = ravDataBuffer instanceof Buffer ? ravDataBuffer.toString() : ravDataBuffer;
        const ravDataDecoded = MultibaseCodec.decodeBase64url(ravDataStr);
        yield JSON.parse(ravDataDecoded);
      }
    } finally {
      client.release();
    }
  }

  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    const client = await this.pool.connect();
    try {
      // Get latest RAV for each sub-channel that hasn't been fully claimed
      const { rows } = await client.query(
        `SELECT DISTINCT ON (r.vm_id_fragment) 
           r.vm_id_fragment, r.rav_data, r.nonce
         FROM ${this.ravsTable} r
         LEFT JOIN ${this.claimsTable} c ON (
           r.channel_id = c.channel_id AND 
           r.vm_id_fragment = c.vm_id_fragment
         )
         WHERE r.channel_id = $1 
           AND (c.claimed_nonce IS NULL OR r.nonce > c.claimed_nonce)
         ORDER BY r.vm_id_fragment, r.nonce DESC`,
        [channelId]
      );

      const result = new Map<string, SignedSubRAV>();
      
      for (const row of rows) {
        const ravDataBuffer = row.rav_data;
        const ravDataStr = ravDataBuffer instanceof Buffer ? ravDataBuffer.toString() : ravDataBuffer;
        const ravDataDecoded = MultibaseCodec.decodeBase64url(ravDataStr);
        const rav: SignedSubRAV = JSON.parse(ravDataDecoded);
        result.set(row.vm_id_fragment, rav);
      }

      return result;
    } finally {
      client.release();
    }
  }

  async markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint, txHash?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO ${this.claimsTable}(channel_id, vm_id_fragment, claimed_nonce, tx_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (channel_id, vm_id_fragment)
         DO UPDATE SET 
           claimed_nonce = GREATEST(${this.claimsTable}.claimed_nonce, EXCLUDED.claimed_nonce),
           claimed_at = NOW(),
           tx_hash = EXCLUDED.tx_hash`,
        [channelId, vmIdFragment, nonce.toString(), txHash]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get claim history for a sub-channel
   */
  async getClaimHistory(channelId: string, vmIdFragment: string): Promise<{
    claimedNonce: bigint;
    claimedAt: Date;
    txHash?: string;
  } | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT claimed_nonce, claimed_at, tx_hash
         FROM ${this.claimsTable}
         WHERE channel_id = $1 AND vm_id_fragment = $2`,
        [channelId, vmIdFragment]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        claimedNonce: BigInt(row.claimed_nonce),
        claimedAt: row.claimed_at,
        txHash: row.tx_hash,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(channelId?: string): Promise<{
    totalRAVs: number;
    uniqueChannels: number;
    uniqueSubChannels: number;
    totalClaimedValue: bigint;
  }> {
    const client = await this.pool.connect();
    try {
      const whereClause = channelId ? 'WHERE channel_id = $1' : '';
      const params = channelId ? [channelId] : [];

      const { rows } = await client.query(
        `SELECT 
           COUNT(*) as total_ravs,
           COUNT(DISTINCT channel_id) as unique_channels,
           COUNT(DISTINCT channel_id || vm_id_fragment) as unique_sub_channels,
           COALESCE(SUM(accumulated_amount), 0) as total_value
         FROM ${this.ravsTable} ${whereClause}`,
        params
      );

      return {
        totalRAVs: parseInt(rows[0].total_ravs),
        uniqueChannels: parseInt(rows[0].unique_channels),
        uniqueSubChannels: parseInt(rows[0].unique_sub_channels),
        totalClaimedValue: BigInt(rows[0].total_value),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old RAVs (optional maintenance operation)
   */
  async cleanup(options: {
    retentionDays?: number;
    keepLatestPerSubChannel?: boolean;
  } = {}): Promise<{ deletedCount: number }> {
    const { retentionDays = 30, keepLatestPerSubChannel = true } = options;
    
    const client = await this.pool.connect();
    try {
      let deletedCount = 0;

      if (keepLatestPerSubChannel) {
        // Keep latest RAV per sub-channel, delete older ones beyond retention
        const { rowCount } = await client.query(
          `DELETE FROM ${this.ravsTable}
           WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
           AND (channel_id, vm_id_fragment, nonce) NOT IN (
             SELECT channel_id, vm_id_fragment, MAX(nonce)
             FROM ${this.ravsTable}
             GROUP BY channel_id, vm_id_fragment
           )`
        );
        deletedCount = rowCount || 0;
      } else {
        // Simple retention policy
        const { rowCount } = await client.query(
          `DELETE FROM ${this.ravsTable}
           WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`
        );
        deletedCount = rowCount || 0;
      }

      return { deletedCount };
    } finally {
      client.release();
    }
  }
}

/**
 * Helper function to create SqlRAVStore with common configurations
 */
export function createSqlRAVStore(options: {
  connectionString: string;
  tablePrefix?: string;
  autoMigrate?: boolean;
}): SqlRAVStore {
  // Note: This requires importing 'pg' package
  // const { Pool } = require('pg');
  throw new Error('createSqlRAVStore requires importing pg package. See implementation in examples.');
}

/**
 * Supabase-specific helper (uses same SqlRAVStore but with Supabase connection)
 */
export function createSupabaseRAVStore(options: {
  supabaseUrl: string;
  supabaseKey: string;
  tablePrefix?: string;
  autoMigrate?: boolean;
}): SqlRAVStore {
  // Note: This would use Supabase's connection details
  // const connectionString = `postgresql://postgres:${options.supabaseKey}@${extractHost(options.supabaseUrl)}:5432/postgres`;
  throw new Error('createSupabaseRAVStore requires Supabase configuration. See implementation in examples.');
} 