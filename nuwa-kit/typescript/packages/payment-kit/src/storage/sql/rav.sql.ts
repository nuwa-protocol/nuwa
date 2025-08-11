/**
 * SQL-based RAVRepository implementation for PostgreSQL/Supabase
 */

// Note: 'pg' is an optional dependency. Install with: npm install pg @types/pg
import type { Pool, PoolClient } from 'pg';
import { encodeSubRAV, decodeSubRAV } from './serialization';
import type { RAVRepository } from '../interfaces/RAVRepository';
import type { SignedSubRAV } from '../../core/types';

export interface SqlRAVRepositoryOptions {
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
 * PostgreSQL/Supabase implementation of RAVRepository
 *
 * Compatible with both self-hosted Postgres and Supabase
 * Uses standard SQL that works across both platforms
 */
export class SqlRAVRepository implements RAVRepository {
  private pool: Pool;
  private tablePrefix: string;
  private autoMigrate: boolean;
  private allowUnsafeAutoMigrateInProd: boolean;

  constructor(options: SqlRAVRepositoryOptions) {
    this.pool = options.pool;
    this.tablePrefix = options.tablePrefix || 'nuwa_';
    this.autoMigrate = options.autoMigrate ?? true;
    this.allowUnsafeAutoMigrateInProd = options.allowUnsafeAutoMigrateInProd ?? false;

    // Only auto-migrate in development or when explicitly allowed in production
    if (this.autoMigrate) {
      if (process.env.NODE_ENV === 'production' && this.allowUnsafeAutoMigrateInProd) {
        console.warn(
          'WARNING: Unsafe auto-migration is enabled in production. This may lead to data loss or schema conflicts. ' +
            'Ensure you understand the risks before proceeding.'
        );
      } else if (process.env.NODE_ENV === 'production') {
        throw new Error(
          "Auto-migration is disabled in production by default. To enable it, set 'allowUnsafeAutoMigrateInProd' to true " +
            'and acknowledge the risks.'
        );
      }
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
          sub_rav_bcs       BYTEA NOT NULL,
          signature         BYTEA NOT NULL,
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
      // Encode SubRAV using BCS serialization
      const subRavBcs = encodeSubRAV(rav.subRav);
      const signature = Buffer.from(rav.signature);

      await client.query(
        `
        INSERT INTO ${this.ravsTable} 
        (channel_id, vm_id_fragment, nonce, accumulated_amount, sub_rav_bcs, signature)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (channel_id, vm_id_fragment, nonce) 
        DO NOTHING
      `,
        [
          rav.subRav.channelId,
          rav.subRav.vmIdFragment,
          rav.subRav.nonce.toString(),
          rav.subRav.accumulatedAmount.toString(),
          subRavBcs,
          signature,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT sub_rav_bcs, signature 
        FROM ${this.ravsTable}
        WHERE channel_id = $1 AND vm_id_fragment = $2
        ORDER BY nonce DESC
        LIMIT 1
      `,
        [channelId, vmIdFragment]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const subRavBcs = result.rows[0].sub_rav_bcs as Buffer;
      const signature = result.rows[0].signature as Buffer;

      const subRav = decodeSubRAV(subRavBcs);
      return {
        subRav,
        signature: new Uint8Array(signature),
      };
    } finally {
      client.release();
    }
  }

  async *list(channelId: string): AsyncIterable<SignedSubRAV> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT sub_rav_bcs, signature
        FROM ${this.ravsTable}
        WHERE channel_id = $1
        ORDER BY vm_id_fragment, nonce
      `,
        [channelId]
      );

      for (const row of result.rows) {
        const subRavBcs = row.sub_rav_bcs as Buffer;
        const signature = row.signature as Buffer;

        const subRav = decodeSubRAV(subRavBcs);
        yield {
          subRav,
          signature: new Uint8Array(signature),
        };
      }
    } finally {
      client.release();
    }
  }

  async getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT DISTINCT ON (r.vm_id_fragment) 
               r.vm_id_fragment, r.sub_rav_bcs, r.signature
        FROM ${this.ravsTable} r
        LEFT JOIN ${this.claimsTable} c 
          ON r.channel_id = c.channel_id 
          AND r.vm_id_fragment = c.vm_id_fragment
        WHERE r.channel_id = $1 
          AND (c.claimed_nonce IS NULL OR r.nonce > c.claimed_nonce)
        ORDER BY r.vm_id_fragment, r.nonce DESC
      `,
        [channelId]
      );

      const unclaimedRAVs = new Map<string, SignedSubRAV>();

      for (const row of result.rows) {
        const subRavBcs = row.sub_rav_bcs as Buffer;
        const signature = row.signature as Buffer;

        const subRav = decodeSubRAV(subRavBcs);
        const signedSubRAV = {
          subRav,
          signature: new Uint8Array(signature),
        };

        unclaimedRAVs.set(row.vm_id_fragment, signedSubRAV);
      }

      return unclaimedRAVs;
    } finally {
      client.release();
    }
  }

  async markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        INSERT INTO ${this.claimsTable} 
        (channel_id, vm_id_fragment, claimed_nonce)
        VALUES ($1, $2, $3)
        ON CONFLICT (channel_id, vm_id_fragment) 
        DO UPDATE SET 
          claimed_nonce = GREATEST(${this.claimsTable}.claimed_nonce, EXCLUDED.claimed_nonce),
          claimed_at = NOW()
      `,
        [channelId, vmIdFragment, nonce.toString()]
      );
    } finally {
      client.release();
    }
  }

  async getStats(): Promise<{ totalRAVs: number; unclaimedRAVs: number }> {
    const client = await this.pool.connect();
    try {
      // Get total RAVs count
      const totalResult = await client.query(`
        SELECT COUNT(*) as total_ravs FROM ${this.ravsTable}
      `);
      const totalRAVs = parseInt(totalResult.rows[0].total_ravs);

      // Get unclaimed RAVs count (count distinct vm_id_fragments with unclaimed RAVs)
      const unclaimedResult = await client.query(`
        SELECT COUNT(DISTINCT r.vm_id_fragment) as unclaimed_ravs
        FROM ${this.ravsTable} r
        LEFT JOIN ${this.claimsTable} c 
          ON r.channel_id = c.channel_id 
          AND r.vm_id_fragment = c.vm_id_fragment
        WHERE c.claimed_nonce IS NULL OR r.nonce > c.claimed_nonce
      `);
      const unclaimedRAVs = parseInt(unclaimedResult.rows[0].unclaimed_ravs);

      return { totalRAVs, unclaimedRAVs };
    } finally {
      client.release();
    }
  }

  async cleanup(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        DELETE FROM ${this.ravsTable} r
        WHERE EXISTS (
          SELECT 1 FROM ${this.claimsTable} c
          WHERE c.channel_id = r.channel_id 
            AND c.vm_id_fragment = r.vm_id_fragment
            AND r.nonce <= c.claimed_nonce
        )
      `);

      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }
}
