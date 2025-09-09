/**
 * Memory-based implementation of PendingSubRAVRepository
 * For testing and development environments
 */

import { DebugLogger } from '@nuwa-ai/identity-kit';
import type { SubRAV } from '../../core/types';
import type { PendingSubRAVRepository } from '../interfaces/PendingSubRAVRepository';
import type { PendingSubRAVStats } from '../types/pagination';

export class MemoryPendingSubRAVRepository implements PendingSubRAVRepository {
  private proposals = new Map<string, { subRAV: SubRAV; timestamp: number }>();
  private logger: DebugLogger = DebugLogger.get('pendingSubRavMemory');
  private getKey(channelId: string, vmIdFragment: string, nonce: bigint): string {
    return `${channelId}:${vmIdFragment}:${nonce}`;
  }

  async save(subRAV: SubRAV): Promise<void> {
    const key = this.getKey(subRAV.channelId, subRAV.vmIdFragment, subRAV.nonce);
    this.logger.debug('Saving sub-RAV', { key, subRAV });
    this.proposals.set(key, {
      subRAV: { ...subRAV }, // Deep copy to avoid mutations
      timestamp: Date.now(),
    });
  }

  async find(channelId: string, vmIdFragment: string, nonce: bigint): Promise<SubRAV | null> {
    const key = this.getKey(channelId, vmIdFragment, nonce);
    const entry = this.proposals.get(key);

    if (!entry) {
      return null;
    }

    return { ...entry.subRAV }; // Return copy to avoid mutations
  }

  async findLatestBySubChannel(channelId: string, vmIdFragment: string): Promise<SubRAV | null> {
    let latestSubRAV: SubRAV | null = null;
    let maxNonce = BigInt(-1);

    for (const [key, entry] of this.proposals) {
      if (key.startsWith(`${channelId}:${vmIdFragment}:`)) {
        const subRAV = entry.subRAV;
        if (subRAV.nonce > maxNonce) {
          maxNonce = subRAV.nonce;
          latestSubRAV = subRAV;
        }
      }
    }
    this.logger.debug('Latest sub-RAV', { channelId, vmIdFragment, latestSubRAV });
    return latestSubRAV ? { ...latestSubRAV } : null; // Return copy to avoid mutations
  }

  async remove(channelId: string, vmIdFragment: string, nonce: bigint): Promise<void> {
    this.logger.debug('Removing sub-RAV', { channelId, vmIdFragment, nonce });
    const key = this.getKey(channelId, vmIdFragment, nonce);
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
      const channelId = key.split(':')[0];
      byChannel[channelId] = (byChannel[channelId] || 0) + 1;

      if (oldestTimestamp === undefined || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (newestTimestamp === undefined || entry.timestamp > newestTimestamp) {
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
