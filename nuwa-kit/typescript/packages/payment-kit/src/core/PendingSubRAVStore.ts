/**
 * PendingSubRAVStore - Storage for unsigned SubRAV proposals
 * 
 * Manages the persistence of unsigned SubRAVs that are sent to clients
 * and awaiting signature in the deferred payment model.
 */

import type { SubRAV } from './types';

/**
 * Interface for storing unsigned SubRAV proposals
 */
export interface PendingSubRAVStore {
  /**
   * Save an unsigned SubRAV proposal
   */
  save(subRAV: SubRAV): Promise<void>;

  /**
   * Find a pending SubRAV by channel ID and nonce
   */
  find(channelId: string, nonce: bigint): Promise<SubRAV | null>;

  /**
   * Remove a pending SubRAV after it's been signed and processed
   */
  remove(channelId: string, nonce: bigint): Promise<void>;

  /**
   * Clean up expired proposals older than specified age
   * @param maxAgeMs Maximum age in milliseconds (default: 30 minutes)
   * @returns Number of cleaned up proposals
   */
  cleanup(maxAgeMs?: number): Promise<number>;

  /**
   * Get statistics about pending proposals
   */
  getStats(): Promise<PendingSubRAVStats>;

  /**
   * Clear all pending proposals (for testing/cleanup)
   */
  clear(): Promise<void>;
}

/**
 * Statistics about pending SubRAV proposals
 */
export interface PendingSubRAVStats {
  /** Total number of pending proposals */
  totalCount: number;
  /** Number of proposals by channel */
  byChannel: Record<string, number>;
  /** Oldest proposal timestamp */
  oldestTimestamp?: number;
  /** Newest proposal timestamp */
  newestTimestamp?: number;
}

/**
 * Memory-based implementation of PendingSubRAVStore
 * Compatible with original behavior but with proper interface
 */
export class MemoryPendingSubRAVStore implements PendingSubRAVStore {
  private proposals = new Map<string, { subRAV: SubRAV; timestamp: number }>();

  private getKey(channelId: string, nonce: bigint): string {
    return `${channelId}:${nonce}`;
  }

  async save(subRAV: SubRAV): Promise<void> {
    const key = this.getKey(subRAV.channelId, subRAV.nonce);
    this.proposals.set(key, {
      subRAV: { ...subRAV }, // Deep copy to avoid mutations
      timestamp: Date.now(),
    });
  }

  async find(channelId: string, nonce: bigint): Promise<SubRAV | null> {
    const key = this.getKey(channelId, nonce);
    const entry = this.proposals.get(key);
    
    if (!entry) {
      return null;
    }

    return { ...entry.subRAV }; // Return copy to avoid mutations
  }

  async remove(channelId: string, nonce: bigint): Promise<void> {
    const key = this.getKey(channelId, nonce);
    this.proposals.delete(key);
  }

  async cleanup(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const cutoff = now - maxAgeMs;
    let cleanedCount = 0;

    for (const [key, entry] of this.proposals.entries()) {
      if (entry.timestamp < cutoff) {
        this.proposals.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  async getStats(): Promise<PendingSubRAVStats> {
    const byChannel: Record<string, number> = {};
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    for (const [key, entry] of this.proposals.entries()) {
      const channelId = entry.subRAV.channelId;
      byChannel[channelId] = (byChannel[channelId] || 0) + 1;

      if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (!newestTimestamp || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    return {
      totalCount: this.proposals.size,
      byChannel,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  async clear(): Promise<void> {
    this.proposals.clear();
  }
}

/**
 * SQL-based implementation placeholder
 * TODO: Implement with actual PostgreSQL/Supabase support
 */
export class SqlPendingSubRAVStore implements PendingSubRAVStore {
  constructor(private connectionString: string) {
    // TODO: Initialize database connection
  }

  async save(subRAV: SubRAV): Promise<void> {
    // TODO: INSERT INTO nuwa_rav_proposals
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }

  async find(channelId: string, nonce: bigint): Promise<SubRAV | null> {
    // TODO: SELECT FROM nuwa_rav_proposals WHERE channel_id = ? AND nonce = ?
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }

  async remove(channelId: string, nonce: bigint): Promise<void> {
    // TODO: DELETE FROM nuwa_rav_proposals WHERE channel_id = ? AND nonce = ?
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }

  async cleanup(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    // TODO: DELETE FROM nuwa_rav_proposals WHERE created_at < NOW() - INTERVAL ?
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }

  async getStats(): Promise<PendingSubRAVStats> {
    // TODO: SELECT COUNT(*), channel_id, MIN(created_at), MAX(created_at) FROM nuwa_rav_proposals
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }

  async clear(): Promise<void> {
    // TODO: DELETE FROM nuwa_rav_proposals
    throw new Error('SqlPendingSubRAVStore not implemented yet');
  }
}

/**
 * Factory function to create appropriate PendingSubRAVStore implementation
 */
export function createPendingSubRAVStore(
  type: 'memory' | 'sql' = 'memory',
  connectionString?: string
): PendingSubRAVStore {
  switch (type) {
    case 'memory':
      return new MemoryPendingSubRAVStore();
    case 'sql':
      if (!connectionString) {
        throw new Error('Connection string required for SQL PendingSubRAVStore');
      }
      return new SqlPendingSubRAVStore(connectionString);
    default:
      throw new Error(`Unsupported PendingSubRAVStore type: ${type}`);
  }
}
