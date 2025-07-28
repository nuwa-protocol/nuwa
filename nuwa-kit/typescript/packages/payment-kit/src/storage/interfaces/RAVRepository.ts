/**
 * RAV Repository interface
 * Handles persistence of Receipts of Accumulated Value (RAVs)
 */

import type { SignedSubRAV } from '../../core/types';

/**
 * RAV storage interface for Payee (服务端收款方)
 * Responsible for persisting and retrieving SignedSubRAVs
 */
export interface RAVRepository {
  /** Save a new RAV (idempotent operation) */
  save(rav: SignedSubRAV): Promise<void>;

  /** Get the latest RAV for a specific sub-channel */
  getLatest(channelId: string, vmIdFragment: string): Promise<SignedSubRAV | null>;

  /** List all RAVs for a channel (async iterator for pagination) */
  list(channelId: string): AsyncIterable<SignedSubRAV>;

  /** Get unclaimed RAVs grouped by sub-channel */
  getUnclaimedRAVs(channelId: string): Promise<Map<string, SignedSubRAV>>;

  /** Mark RAVs as claimed up to specified nonce */
  markAsClaimed(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void>;

  /** Get statistics about stored RAVs (optional) */
  getStats?(): Promise<{ totalRAVs: number; unclaimedRAVs: number }>;

  /** Cleanup old or processed RAVs (optional) */
  cleanup?(): Promise<number>;
} 