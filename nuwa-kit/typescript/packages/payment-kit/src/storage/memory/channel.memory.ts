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

  private getSubChannelKey(channelId: string, keyId: string): string {
    return `${channelId}:${keyId}`;
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

  async getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState> {
    const key = this.getSubChannelKey(channelId, keyId);
    const existing = this.subChannelStates.get(key);
    
    if (existing) {
      this.hitCount++;
      return { ...existing };
    }

    this.missCount++;
    
    // Return default state if not found
    const defaultState: SubChannelState = {
      channelId,
      epoch: BigInt(0),
      nonce: BigInt(0),
      accumulatedAmount: BigInt(0),
      lastUpdated: Date.now(),
    };
    
    this.subChannelStates.set(key, defaultState);
    return { ...defaultState };
  }

  async updateSubChannelState(
    channelId: string,
    keyId: string,
    updates: Partial<SubChannelState>
  ): Promise<void> {
    const key = this.getSubChannelKey(channelId, keyId);
    const existing = this.subChannelStates.get(key) || {
      channelId,
      epoch: BigInt(0),
      nonce: BigInt(0),
      accumulatedAmount: BigInt(0),
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
        // Extract keyId from the key (format: channelId:keyId)
        const keyId = key.substring(channelId.length + 1);
        result[keyId] = { ...state };
      }
    }
    
    return result;
  }

  async removeSubChannelState(channelId: string, keyId: string): Promise<void> {
    const key = this.getSubChannelKey(channelId, keyId);
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
    // Rough estimation of memory usage
    let size = 0;
    
    for (const channel of this.channelMetadata.values()) {
      size += JSON.stringify(channel).length * 2; // Rough estimate
    }
    
    for (const state of this.subChannelStates.values()) {
      size += JSON.stringify(state).length * 2; // Rough estimate
    }
    
    return size;
  }
} 