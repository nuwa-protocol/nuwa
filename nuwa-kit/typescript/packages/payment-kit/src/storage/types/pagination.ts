/**
 * Pagination and filtering types for storage operations
 */

/**
 * Pagination parameters for listing operations
 */
export interface PaginationParams {
  /** Offset for pagination (number of items to skip) */
  offset?: number;
  /** Maximum number of items to return */
  limit?: number;
}

/**
 * Result with pagination information
 */
export interface PaginatedResult<T> {
  /** The actual items */
  items: T[];
  /** Total number of items (for pagination UI) */
  totalCount: number;
  /** Whether there are more items */
  hasMore: boolean;
}

/**
 * Filter parameters for channel listing
 */
export interface ChannelFilter {
  /** Filter by payer DID */
  payerDid?: string;
  /** Filter by payee DID */
  payeeDid?: string;
  /** Filter by channel status */
  status?: 'active' | 'closing' | 'closed';
  /** Filter by asset ID */
  assetId?: string;
  /** Filter by creation time range */
  createdAfter?: number;
  createdBefore?: number;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  /** Number of cached channels */
  channelCount: number;
  /** Number of cached sub-channel states */
  subChannelCount: number;
  /** Cache hit rate (0-1) */
  hitRate?: number;
  /** Total cache size in bytes (approximate) */
  sizeBytes?: number;
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