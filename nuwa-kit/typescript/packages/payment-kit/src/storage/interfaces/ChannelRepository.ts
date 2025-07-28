/**
 * Channel Repository interface
 * Handles persistence of channel metadata and sub-channel states
 */

import type { ChannelInfo, SubChannelState } from '../../core/types';
import type { PaginationParams, ChannelFilter, PaginatedResult, CacheStats } from '../types/pagination';

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
  listChannelMetadata(filter?: ChannelFilter, pagination?: PaginationParams): Promise<PaginatedResult<ChannelInfo>>;

  /**
   * Remove channel metadata
   */
  removeChannelMetadata(channelId: string): Promise<void>;

  // -------- Sub-Channel State Operations --------

  /**
   * Get sub-channel state for nonce and amount tracking
   * @param channelId - The channel ID to ensure no cross-channel key conflicts
   * @param keyId - Complete DID key ID (e.g., "did:rooch:address#account-key")
   */
  getSubChannelState(channelId: string, keyId: string): Promise<SubChannelState>;
  
  /**
   * Update sub-channel state
   * @param channelId - The channel ID to ensure no cross-channel key conflicts
   * @param keyId - Complete DID key ID (e.g., "did:rooch:address#account-key")
   * @param updates - Partial updates to apply
   */
  updateSubChannelState(channelId: string, keyId: string, updates: Partial<SubChannelState>): Promise<void>;

  /**
   * List all sub-channel states for a channel
   * @param channelId - Channel ID to list sub-channels for
   */
  listSubChannelStates(channelId: string): Promise<Record<string, SubChannelState>>;

  /**
   * Remove sub-channel state
   * @param channelId - Channel ID to ensure no cross-channel conflicts
   * @param keyId - Complete DID key ID
   */
  removeSubChannelState(channelId: string, keyId: string): Promise<void>;

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