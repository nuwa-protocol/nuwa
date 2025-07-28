/**
 * Pending SubRAV Repository interface
 * Handles persistence of unsigned SubRAV proposals awaiting signature
 */

import type { SubRAV } from '../../core/types';
import type { PendingSubRAVStats } from '../types/pagination';

/**
 * Interface for storing unsigned SubRAV proposals
 * Manages the persistence of unsigned SubRAVs that are sent to clients
 * and awaiting signature in the deferred payment model.
 */
export interface PendingSubRAVRepository {
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