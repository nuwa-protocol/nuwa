import { useMemo } from 'react';
import { useRoochEvents, parseEventData, getEventTimestamp } from './useRoochEvents';
import type { RoochEventFilter } from './useRoochEvents';

// Revenue event types based on the payment_revenue module
export const REVENUE_EVENT_TYPES = {
  DEPOSITED: '0x3::payment_revenue::RevenueDepositedEvent',
  WITHDRAWN: '0x3::payment_revenue::RevenueWithdrawnEvent',
  HUB_CREATED: '0x3::payment_revenue::RevenueHubCreatedEvent',
} as const;

export interface RevenueDepositedEvent {
  hub_id: string;
  coin_type: string;
  amount: string;
  owner: string;
  source_description?: string;
  source_type?: string;
  source_id?: {
    value?: {
      vec?: {
        value?: string[][][]; // Nested structure for ObjectID
      };
    };
  };
}

export interface RevenueWithdrawnEvent {
  hub_id: string;
  coin_type: string;
  amount: string;
  recipient: string;
}

export interface RevenueHubCreatedEvent {
  hub_id: string;
  owner: string;
  coin_type: string;
}

export interface RevenueHistoryItem {
  id: string;
  type: 'deposited' | 'withdrawn' | 'hub_created';
  typeDisplay: string;
  timestamp: number;
  txHash: string;
  assetId: string;
  amount?: bigint;
  amountDisplay?: string;
  relatedAddress?: string; // recipient or owner
  hubId: string;
  sourceId?: string; // channel_id for payment_channel, etc.
  sourceType?: string; // payment_channel, etc.
  sourceDescription?: string; // Channel claim, etc.
  rawEvent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface RevenueHistoryFilter extends Omit<RoochEventFilter, 'eventType'> {
  /** Filter by event types */
  eventTypes?: string[];
  /** Filter by hub ID (agent DID) */
  hubId?: string;
  /** Filter by asset ID */
  assetId?: string;
}

export interface UseRevenueHistoryOptions {
  /** Page size for pagination (default: 20) */
  limit?: number;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Polling interval in milliseconds (0 to disable, default: 30000) */
  pollingInterval?: number;
}

/**
 * Hook for fetching revenue history events for an agent
 */
export function useRevenueHistory(
  agentDid: string | undefined,
  filter: RevenueHistoryFilter = {},
  options: UseRevenueHistoryOptions = {}
) {
  const {
    limit = 20,
    autoFetch = true,
    pollingInterval = 30000, // Refresh every 30 seconds
  } = options;

  // Build event filter for all revenue events
  const eventFilter = useMemo((): RoochEventFilter => {
    const baseFilter: RoochEventFilter = {
      ...filter,
    };

    // If specific event types are requested, use them; otherwise query deposited events by default
    // Note: Currently we can only query one event type at a time due to API limitations
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      baseFilter.eventType = filter.eventTypes[0];
    } else {
      // When no specific type is requested, query deposited events (most common)
      // TODO: Enhance to query all event types and merge results
      baseFilter.eventType = REVENUE_EVENT_TYPES.DEPOSITED;
    }

    return baseFilter;
  }, [filter]);

  // Use the base events hook
  const { events, hasNextPage, cursor, loading, error, fetchNextPage, refetch, reset } =
    useRoochEvents(eventFilter, {
      limit,
      autoFetch: autoFetch && !!agentDid,
      pollingInterval,
    });

  // Transform events to revenue history items
  const historyItems = useMemo((): RevenueHistoryItem[] => {
    if (!agentDid) return [];

    return events
      .map(event => {
        const eventType = event.event_type;
        const timestamp = getEventTimestamp(event);
        const txHash = event.tx_hash;
        const eventId = event.indexer_event_id
          ? `${event.indexer_event_id.tx_order}_${event.indexer_event_id.event_index}`
          : `${event.event_id?.event_handle_id || 'unknown'}_${event.event_id?.event_seq || '0'}`;

        // Parse event data based on type
        let historyItem: RevenueHistoryItem | null = null;

        if (eventType === REVENUE_EVENT_TYPES.DEPOSITED) {
          const data = parseEventData<RevenueDepositedEvent>(event);
          if (data) {
            // Extract source_id from the nested structure
            let sourceId: string | undefined;
            if (data.source_id?.value?.vec?.value?.[0]?.[0]?.[0]) {
              sourceId = data.source_id.value.vec.value[0][0][0];
            }

            historyItem = {
              id: eventId,
              type: 'deposited',
              typeDisplay: 'Revenue Deposited',
              timestamp,
              txHash,
              assetId: data.coin_type,
              amount: BigInt(data.amount),
              amountDisplay: formatTokenAmount(BigInt(data.amount)),
              relatedAddress: data.owner, // Keep owner for reference
              hubId: data.hub_id,
              sourceId,
              sourceType: data.source_type,
              sourceDescription: data.source_description,
              rawEvent: event,
            };
          }
        } else if (eventType === REVENUE_EVENT_TYPES.WITHDRAWN) {
          const data = parseEventData<RevenueWithdrawnEvent>(event);
          if (data) {
            historyItem = {
              id: eventId,
              type: 'withdrawn',
              typeDisplay: 'Revenue Withdrawn',
              timestamp,
              txHash,
              assetId: data.coin_type, // 使用coin_type而不是asset_id
              amount: BigInt(data.amount),
              amountDisplay: formatTokenAmount(BigInt(data.amount)),
              relatedAddress: data.recipient,
              hubId: data.hub_id,
              rawEvent: event,
            };
          }
        } else if (eventType === REVENUE_EVENT_TYPES.HUB_CREATED) {
          const data = parseEventData<RevenueHubCreatedEvent>(event);
          if (data) {
            historyItem = {
              id: eventId,
              type: 'hub_created',
              typeDisplay: 'Revenue Hub Created',
              timestamp,
              txHash,
              assetId: data.coin_type,
              relatedAddress: data.owner,
              hubId: data.hub_id,
              rawEvent: event,
            };
          }
        }

        return historyItem;
      })
      .filter((item): item is RevenueHistoryItem => item !== null)
      .filter(item => {
        // Filter by hub ID (agent DID) if specified
        if (filter.hubId && item.hubId !== filter.hubId) {
          return false;
        }

        // Filter by asset ID if specified
        if (filter.assetId && item.assetId !== filter.assetId) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending (newest first)
  }, [events, agentDid, filter.hubId, filter.assetId]);

  // Statistics
  const stats = useMemo(() => {
    const loadedCount = historyItems.length;

    // Find the highest event_seq from loaded events to estimate total count
    // Since we fetch from newest to oldest, the first event should have the highest seq
    let estimatedTotal = loadedCount;

    if (events.length > 0) {
      // Get the event_seq from the first (newest) event
      const firstEvent = events[0];
      if (firstEvent?.event_id?.event_seq) {
        // event_seq is 0-based, so add 1 for total count
        const latestSeq = parseInt(firstEvent.event_id.event_seq);
        if (!isNaN(latestSeq)) {
          estimatedTotal = latestSeq + 1;
        }
      }
    }

    return {
      loadedCount,
      estimatedTotal,
      hasMore: hasNextPage,
    };
  }, [historyItems, events, hasNextPage]);

  return {
    historyItems,
    stats,
    hasNextPage,
    cursor,
    loading,
    error,
    fetchNextPage,
    refetch,
    reset,
  };
}

/**
 * Format token amount with decimals for display
 */
function formatTokenAmount(amount: bigint, decimals: number = 8): string {
  const divisor = 10n ** BigInt(decimals);
  const integer = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return integer.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  return `${integer}.${trimmedFraction}`;
}

/**
 * Get asset symbol from asset ID
 */
export function getAssetSymbol(assetId: string): string {
  const parts = assetId.split('::');
  return parts[parts.length - 1] || 'Unknown';
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}
