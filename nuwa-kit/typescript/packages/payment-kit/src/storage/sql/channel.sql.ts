/**
 * SQL-based ChannelRepository implementation for PostgreSQL/Supabase
 */

import type { Pool, PoolClient } from 'pg';
import type { ChannelRepository } from '../interfaces/ChannelRepository';
import type { ChannelInfo, SubChannelInfo } from '../../core/types';
import type {
  PaginationParams,
  ChannelFilter,
  PaginatedResult,
  CacheStats,
} from '../types/pagination';

export interface SqlChannelRepositoryOptions {
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
 * PostgreSQL/Supabase implementation of ChannelRepository
 */
export class SqlChannelRepository implements ChannelRepository {
  private pool: Pool;
  private tablePrefix: string;
  private autoMigrate: boolean;
  private allowUnsafeAutoMigrateInProd: boolean;

  constructor(options: SqlChannelRepositoryOptions) {
    this.pool = options.pool;
    this.tablePrefix = options.tablePrefix || 'nuwa_';
    this.autoMigrate = options.autoMigrate ?? true;
    this.allowUnsafeAutoMigrateInProd = options.allowUnsafeAutoMigrateInProd ?? false;

    // Only auto-migrate in development or when explicitly allowed in production
    if (
      this.autoMigrate &&
      (process.env.NODE_ENV !== 'production' || this.allowUnsafeAutoMigrateInProd)
    ) {
      this.initialize().catch(console.error);
    }
  }

  private get channelsTable(): string {
    return `${this.tablePrefix}channels`;
  }

  private get subChannelStatesTable(): string {
    return `${this.tablePrefix}sub_channel_states`;
  }

  /**
   * Initialize database tables if they don't exist
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create channels table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.channelsTable} (
          channel_id        TEXT PRIMARY KEY,
          payer_did         TEXT NOT NULL,
          payee_did         TEXT NOT NULL,
          asset_id          TEXT NOT NULL,
          status            TEXT NOT NULL,
          balance           NUMERIC(78,0) NOT NULL,
          created_at        BIGINT NOT NULL,
          updated_at        BIGINT NOT NULL,
          metadata          JSONB
        )
      `);

      // Create sub-channel states table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.subChannelStatesTable} (
          channel_id          TEXT NOT NULL,
          vm_id_fragment      TEXT NOT NULL,
          channel_id_ref      TEXT NOT NULL,
          epoch               NUMERIC(78,0) NOT NULL DEFAULT 0,
          last_confirmed_nonce NUMERIC(78,0) NOT NULL DEFAULT 0,
          last_claimed_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
          last_update_time    BIGINT NOT NULL,
          PRIMARY KEY(channel_id, vm_id_fragment)
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}channels_payer 
        ON ${this.channelsTable}(payer_did)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tablePrefix}channels_payee 
        ON ${this.channelsTable}(payee_did)
      `);
    } finally {
      client.release();
    }
  }

  // -------- Channel Metadata Operations --------

  async getChannelMetadata(channelId: string): Promise<ChannelInfo | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT channel_id, payer_did, payee_did, asset_id, status, balance, created_at, updated_at, metadata
        FROM ${this.channelsTable}
        WHERE channel_id = $1
      `,
        [channelId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        channelId: row.channel_id,
        payerDid: row.payer_did,
        payeeDid: row.payee_did,
        assetId: row.asset_id,
        status: row.status,
        epoch: row.metadata?.epoch ? BigInt(row.metadata.epoch) : BigInt(0),
      };
    } finally {
      client.release();
    }
  }

  async setChannelMetadata(channelId: string, metadata: ChannelInfo): Promise<void> {
    const client = await this.pool.connect();
    try {
      const metadataJson = {
        epoch: metadata.epoch?.toString(),
        // Add any other metadata fields that aren't in the main columns
      };

      await client.query(
        `
        INSERT INTO ${this.channelsTable} 
        (channel_id, payer_did, payee_did, asset_id, status, balance, created_at, updated_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (channel_id) 
        DO UPDATE SET
          payer_did = EXCLUDED.payer_did,
          payee_did = EXCLUDED.payee_did,
          asset_id = EXCLUDED.asset_id,
          status = EXCLUDED.status,
          balance = EXCLUDED.balance,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
      `,
        [
          channelId,
          metadata.payerDid,
          metadata.payeeDid,
          metadata.assetId,
          metadata.status,
          '0', // balance not in ChannelInfo
          Date.now().toString(), // created_at
          Date.now().toString(), // updated_at
          JSON.stringify(metadataJson),
        ]
      );
    } finally {
      client.release();
    }
  }

  async listChannelMetadata(
    filter?: ChannelFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<ChannelInfo>> {
    const client = await this.pool.connect();
    try {
      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause from filter
      if (filter) {
        const conditions: string[] = [];

        if (filter.payerDid) {
          conditions.push(`payer_did = $${paramIndex++}`);
          params.push(filter.payerDid);
        }

        if (filter.payeeDid) {
          conditions.push(`payee_did = $${paramIndex++}`);
          params.push(filter.payeeDid);
        }

        if (filter.status) {
          conditions.push(`status = $${paramIndex++}`);
          params.push(filter.status);
        }

        if (conditions.length > 0) {
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }
      }

      // Build pagination
      const limit = pagination?.limit || 50;
      const offset = pagination?.offset || 0;

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM ${this.channelsTable} ${whereClause}`;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get data
      const dataQuery = `
        SELECT channel_id, payer_did, payee_did, asset_id, status, balance, created_at, updated_at, metadata
        FROM ${this.channelsTable} 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(limit, offset);

      const dataResult = await client.query(dataQuery, params);

      const items = dataResult.rows.map(row => ({
        channelId: row.channel_id,
        payerDid: row.payer_did,
        payeeDid: row.payee_did,
        assetId: row.asset_id,
        status: row.status,
        epoch: row.metadata?.epoch ? BigInt(row.metadata.epoch) : BigInt(0),
      }));

      return {
        items,
        totalCount: total,
        hasMore: offset + limit < total,
      };
    } finally {
      client.release();
    }
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        DELETE FROM ${this.channelsTable} WHERE channel_id = $1
      `,
        [channelId]
      );
    } finally {
      client.release();
    }
  }

  // -------- Sub-Channel State Operations --------

  async getSubChannelState(
    channelId: string,
    vmIdFragment: string
  ): Promise<SubChannelInfo | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT channel_id_ref, epoch, last_confirmed_nonce, last_claimed_amount, last_update_time, vm_id_fragment
        FROM ${this.subChannelStatesTable}
        WHERE channel_id = $1 AND vm_id_fragment = $2
      `,
        [channelId, vmIdFragment]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        channelId: row.channel_id_ref,
        vmIdFragment: row.vm_id_fragment,
        epoch: BigInt(row.epoch),
        lastConfirmedNonce: BigInt(row.last_confirmed_nonce),
        lastClaimedAmount: BigInt(row.last_claimed_amount),
        lastUpdated: parseInt(row.last_update_time),
      } as any;
    } finally {
      client.release();
    }
  }

  async updateSubChannelState(
    channelId: string,
    vmIdFragment: string,
    updates: Partial<SubChannelInfo>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // First, get current state or create default
      const current =
        (await this.getSubChannelState(channelId, vmIdFragment)) ||
        ({
          channelId,
          vmIdFragment,
          epoch: BigInt(0),
          lastConfirmedNonce: BigInt(0),
          lastClaimedAmount: BigInt(0),
          lastUpdated: Date.now(),
        } as any);

      // Apply updates
      const newState: any = {
        channelId: (updates as any).channelId ?? current.channelId,
        epoch: (updates as any).epoch ?? current.epoch,
        lastConfirmedNonce: (updates as any).lastConfirmedNonce ?? current.lastConfirmedNonce,
        lastClaimedAmount: (updates as any).lastClaimedAmount ?? current.lastClaimedAmount,
        lastUpdated: (updates as any).lastUpdated ?? Date.now(),
      };

      await client.query(
        `
        INSERT INTO ${this.subChannelStatesTable} 
        (channel_id, vm_id_fragment, channel_id_ref, epoch, last_confirmed_nonce, last_claimed_amount, last_update_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (channel_id, vm_id_fragment) 
        DO UPDATE SET
          channel_id_ref = EXCLUDED.channel_id_ref,
          epoch = EXCLUDED.epoch,
          last_confirmed_nonce = EXCLUDED.last_confirmed_nonce,
          last_claimed_amount = EXCLUDED.last_claimed_amount,
          last_update_time = EXCLUDED.last_update_time
      `,
        [
          channelId,
          vmIdFragment,
          newState.channelId,
          newState.epoch.toString(),
          newState.lastConfirmedNonce.toString(),
          newState.lastClaimedAmount.toString(),
          newState.lastUpdated.toString(),
        ]
      );
    } finally {
      client.release();
    }
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelInfo>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `
        SELECT vm_id_fragment, channel_id_ref, epoch, last_confirmed_nonce, last_claimed_amount, last_update_time
        FROM ${this.subChannelStatesTable}
        WHERE channel_id = $1
      `,
        [channelId]
      );

      const states: Record<string, SubChannelInfo> = {};

      for (const row of result.rows) {
        states[row.vm_id_fragment] = {
          channelId: row.channel_id_ref,
          vmIdFragment: row.vm_id_fragment,
          epoch: BigInt(row.epoch),
          lastConfirmedNonce: BigInt(row.last_confirmed_nonce),
          lastClaimedAmount: BigInt(row.last_claimed_amount),
          lastUpdated: parseInt(row.last_update_time),
        } as any;
      }

      return states;
    } finally {
      client.release();
    }
  }

  async removeSubChannelState(channelId: string, vmIdFragment: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `
        DELETE FROM ${this.subChannelStatesTable} 
        WHERE channel_id = $1 AND vm_id_fragment = $2
      `,
        [channelId, vmIdFragment]
      );
    } finally {
      client.release();
    }
  }

  // -------- Management Operations --------

  async getStats(): Promise<CacheStats> {
    const client = await this.pool.connect();
    try {
      const channelResult = await client.query(`
        SELECT COUNT(*) as total_channels FROM ${this.channelsTable}
      `);

      const subChannelResult = await client.query(`
        SELECT COUNT(*) as total_sub_channels FROM ${this.subChannelStatesTable}
      `);

      return {
        channelCount: parseInt(channelResult.rows[0].total_channels),
        subChannelCount: parseInt(subChannelResult.rows[0].total_sub_channels),
        hitRate: 0, // TODO: Could calculate actual size if needed
        sizeBytes: 0, // TODO: Could calculate actual size if needed
      };
    } finally {
      client.release();
    }
  }

  async clear(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`DELETE FROM ${this.subChannelStatesTable}`);
      await client.query(`DELETE FROM ${this.channelsTable}`);
    } finally {
      client.release();
    }
  }
}
