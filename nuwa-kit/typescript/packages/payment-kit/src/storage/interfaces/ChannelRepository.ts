/**
 * Channel Repository interface
 * Handles persistence of channel metadata and sub-channel states
 */

import type { ChannelInfo, SubChannelInfo } from '../../core/types';
import type {
  PaginationParams,
  ChannelFilter,
  PaginatedResult,
  CacheStats,
} from '../types/pagination';

/**
 * Repository interface for channel data persistence
 */
export interface ChannelRepository {
  // -------- Channel Metadata Operations --------

  /**
   * Get channel metadata by channel ID
   */
  getChannelMetadata(channelId: string): Promise<ChannelInfo | null>;

  /**
   * Set/update channel metadata
   */
  setChannelMetadata(channelId: string, metadata: ChannelInfo): Promise<void>;

  /**
   * List channel metadata with pagination and filtering
   * @param filter - Optional filter criteria
   * @param pagination - Optional pagination parameters
   */
  listChannelMetadata(
    filter?: ChannelFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<ChannelInfo>>;

  /**
   * Remove channel metadata
   */
  removeChannelMetadata(channelId: string): Promise<void>;

  // -------- Sub-Channel State Operations --------

  /**
   * Get sub-channel state for nonce and amount tracking
   * @param channelId - The channel ID to ensure no cross-channel conflicts
   * @param vmIdFragment - DID verification method fragment (e.g., "key-1")
   * @returns Sub-channel state if present; null if no local information
   */
  getSubChannelState(channelId: string, vmIdFragment: string): Promise<SubChannelInfo | null>;

  /**
   * Update sub-channel state
   * Only used when synchronizing data from the blockchain.
   * @param channelId - The channel ID to ensure no cross-channel conflicts
   * @param vmIdFragment - DID verification method fragment (e.g., "key-1")
   * @param updates - Partial updates to apply
   */
  updateSubChannelState(
    channelId: string,
    vmIdFragment: string,
    updates: Partial<SubChannelInfo>
  ): Promise<void>;

  /**
   * List all sub-channel states for a channel
   * @param channelId - Channel ID to list sub-channels for
   */
  listSubChannelStates(channelId: string): Promise<Record<string, SubChannelInfo>>;

  /**
   * Remove sub-channel state
   * @param channelId - Channel ID to ensure no cross-channel conflicts
   * @param vmIdFragment - DID verification method fragment
   */
  removeSubChannelState(channelId: string, vmIdFragment: string): Promise<void>;

  // -------- Management Operations --------

  /**
   * Get repository statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Clear all stored data
   */
  clear(): Promise<void>;
}
