/**
 * Memory-based implementation of ChannelRepository
 * For testing and development environments
 */

import type { ChannelInfo, SubChannelState } from '../../core/types';
import type { ChannelRepository } from '../interfaces/ChannelRepository';
import type { PaginationParams, ChannelFilter, PaginatedResult, CacheStats } from '../types/pagination';

export class MemoryChannelRepository implements ChannelRepository {
  private channelMetadata = new Map<string, ChannelInfo>();
  private subChannelStates = new Map<string, SubChannelState>();
  private hitCount = 0;
  private missCount = 0;

  private getSubChannelKey(channelId: string, vmIdFragment: string): string {
    return `${channelId}:${vmIdFragment}`;
  }

  // -------- Channel Metadata Operations --------

  async getChannelMetadata(channelId: string): Promise<ChannelInfo | null> {
    const result = this.channelMetadata.get(channelId) || null;
    if (result) {
      this.hitCount++;
    } else {
      this.missCount++;
    }
    return result;
  }

  async setChannelMetadata(channelId: string, metadata: ChannelInfo): Promise<void> {
    this.channelMetadata.set(channelId, { ...metadata });
  }

  async listChannelMetadata(
    filter?: ChannelFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<ChannelInfo>> {
    let channels = Array.from(this.channelMetadata.values());

    // Apply filters
    if (filter) {
      channels = channels.filter(channel => {
        if (filter.payerDid && channel.payerDid !== filter.payerDid) return false;
        if (filter.payeeDid && channel.payeeDid !== filter.payeeDid) return false;
        if (filter.status && channel.status !== filter.status) return false;
        if (filter.assetId && channel.assetId !== filter.assetId) return false;
        // Note: ChannelInfo doesn't have createdAt field in current definition
        // These filters are not supported yet
        // if (filter.createdAfter && channel.createdAt < filter.createdAfter) return false;
        // if (filter.createdBefore && channel.createdAt > filter.createdBefore) return false;
        return true;
      });
    }

    const totalCount = channels.length;
    
    // Apply pagination
    const offset = pagination?.offset || 0;
    const limit = pagination?.limit || 50;
    const paginatedChannels = channels.slice(offset, offset + limit);

    return {
      items: paginatedChannels,
      totalCount,
      hasMore: offset + limit < totalCount,
    };
  }

  async removeChannelMetadata(channelId: string): Promise<void> {
    this.channelMetadata.delete(channelId);
  }

  // -------- Sub-Channel State Operations --------

  async getSubChannelState(channelId: string, vmIdFragment: string): Promise<SubChannelState | null> {
    const key = this.getSubChannelKey(channelId, vmIdFragment);
    const existing = this.subChannelStates.get(key);
    
    if (existing) {
      this.hitCount++;
      return { ...existing };
    }
    
    this.missCount++;
    return null;
  }

  async updateSubChannelState(
    channelId: string,
    vmIdFragment: string,
    updates: Partial<SubChannelState>
  ): Promise<void> {
    const key = this.getSubChannelKey(channelId, vmIdFragment);
    const existing = this.subChannelStates.get(key) || {
      channelId,
      vmIdFragment,
      epoch: BigInt(0),
      lastConfirmedNonce: BigInt(0),
      lastClaimedAmount: BigInt(0),
      lastUpdated: Date.now(),
    };

    const updated = {
      ...existing,
      ...updates,
      lastUpdated: Date.now(),
    };

    this.subChannelStates.set(key, updated);
  }

  async listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>> {
    const result: Record<string, SubChannelState> = {};
    
    for (const [key, state] of this.subChannelStates.entries()) {
      if (key.startsWith(channelId + ':')) {
        // Extract vmIdFragment from the key (format: channelId:vmIdFragment)
        const vmIdFragment = key.substring(channelId.length + 1);
        result[vmIdFragment] = { ...state };
      }
    }
    
    return result;
  }

  async removeSubChannelState(channelId: string, vmIdFragment: string): Promise<void> {
    const key = this.getSubChannelKey(channelId, vmIdFragment);
    this.subChannelStates.delete(key);
  }

  // -------- Management Operations --------

  async getStats(): Promise<CacheStats> {
    const totalAccess = this.hitCount + this.missCount;
    
    return {
      channelCount: this.channelMetadata.size,
      subChannelCount: this.subChannelStates.size,
      hitRate: totalAccess > 0 ? this.hitCount / totalAccess : 0,
      sizeBytes: this.estimateSize(),
    };
  }

  async clear(): Promise<void> {
    this.channelMetadata.clear();
    this.subChannelStates.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  private estimateSize(): number {
    // Rough estimation of memory usage (avoiding BigInt serialization issues)
    let size = 0;
    
    for (const channel of this.channelMetadata.values()) {
      // Simple estimation without JSON.stringify to avoid BigInt issues
      size += channel.channelId.length * 2;
      size += channel.payerDid.length * 2;
      size += channel.payeeDid.length * 2;
      size += channel.assetId.length * 2;
      size += 100; // Rough estimate for bigint and other fields
    }
    
    for (const state of this.subChannelStates.values()) {
      // Simple estimation without JSON.stringify to avoid BigInt issues
      size += state.channelId.length * 2;
      size += 200; // Rough estimate for bigint fields and numbers
    }
    
    return size;
  }
} 