import { useState, useEffect, useCallback } from 'react';
import { RoochClient } from '@roochnetwork/rooch-sdk';

export interface RoochEventFilter {
  /** Event type filter (e.g., "0x3::payment_revenue::RevenueDepositedEvent") */
  eventType?: string;
  /** Sender address filter */
  sender?: string;
  /** Transaction hash filter */
  txHash?: string;
  /** Time range filter (start timestamp in milliseconds) */
  timeFrom?: number;
  /** Time range filter (end timestamp in milliseconds) */
  timeTo?: number;
}

export interface RoochEventResult {
  events: any[];
  hasNextPage: boolean;
  cursor?: string;
  loading: boolean;
  error: string | null;
}

export interface UseRoochEventsOptions {
  /** Page size for pagination (default: 20) */
  limit?: number;
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Polling interval in milliseconds (0 to disable, default: 0) */
  pollingInterval?: number;
  /** RPC URL override */
  rpcUrl?: string;
  /** Network override */
  network?: string;
}

/**
 * Hook for querying Rooch blockchain events with filtering and pagination
 */
export function useRoochEvents(
  filter: RoochEventFilter,
  options: UseRoochEventsOptions = {}
): RoochEventResult & {
  /** Fetch next page of events */
  fetchNextPage: () => Promise<void>;
  /** Refresh current page */
  refetch: () => Promise<void>;
  /** Reset to first page */
  reset: () => void;
} {
  const { limit = 20, autoFetch = true, pollingInterval = 0, rpcUrl } = options;

  const [events, setEvents] = useState<any[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Rooch client
  const [roochClient, setRoochClient] = useState<RoochClient | null>(null);

  useEffect(() => {
    try {
      const client = new RoochClient({
        url: rpcUrl || import.meta.env.VITE_ROOCH_RPC_URL || 'https://test-seed.rooch.network',
      });
      setRoochClient(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Rooch client');
    }
  }, [rpcUrl]);

  // Build event filter for Rooch SDK
  const buildEventFilter = useCallback((): any => {
    const eventFilter: any = {};

    if (filter.eventType) {
      eventFilter.event_type = filter.eventType;
    }

    if (filter.sender) {
      eventFilter.sender = filter.sender;
    }

    if (filter.txHash) {
      eventFilter.tx_hash = filter.txHash;
    }

    return eventFilter;
  }, [filter]);

  // Fetch events from Rooch
  const fetchEvents = useCallback(
    async (nextCursor?: string, append: boolean = false): Promise<void> => {
      if (!roochClient) {
        setError('Rooch client not initialized');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const eventFilter = buildEventFilter();

        const queryOptions: any = {
          decode: true,
          showDisplay: true,
        };

        const result: any = await roochClient.queryEvents({
          filter: eventFilter,
          cursor: nextCursor || null,
          limit: limit.toString(),
          queryOptions,
        });

        const newEvents = result.data || [];

        // Filter by time range if specified (client-side filtering)
        let filteredEvents = newEvents;
        if (filter.timeFrom || filter.timeTo) {
          filteredEvents = newEvents.filter((event: any) => {
            const eventTime = parseInt(event.created_at); // event.created_at is in milliseconds

            if (filter.timeFrom && eventTime < filter.timeFrom) {
              return false;
            }

            if (filter.timeTo && eventTime > filter.timeTo) {
              return false;
            }

            return true;
          });
        }

        if (append) {
          setEvents(prev => [...prev, ...filteredEvents]);
        } else {
          setEvents(filteredEvents);
        }

        setHasNextPage(result.has_next_page || false);
        setCursor(result.next_cursor);
      } catch (err) {
        console.error('[useRoochEvents] Failed to fetch events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
        setLoading(false);
      }
    },
    [roochClient, buildEventFilter, filter.timeFrom, filter.timeTo, limit]
  );

  // Fetch next page
  const fetchNextPage = useCallback(async (): Promise<void> => {
    if (!hasNextPage || !cursor) return;
    await fetchEvents(cursor, true);
  }, [fetchEvents, hasNextPage, cursor]);

  // Refetch current page
  const refetch = useCallback(async (): Promise<void> => {
    await fetchEvents(undefined, false);
  }, [fetchEvents]);

  // Reset to first page
  const reset = useCallback((): void => {
    setEvents([]);
    setHasNextPage(false);
    setCursor(undefined);
    setError(null);
  }, []);

  // Auto-fetch on mount and filter changes
  useEffect(() => {
    if (autoFetch && roochClient) {
      reset();
      fetchEvents();
    }
  }, [autoFetch, roochClient, fetchEvents, reset]);

  // Polling
  useEffect(() => {
    if (pollingInterval > 0 && roochClient && !loading) {
      const interval = setInterval(() => {
        refetch();
      }, pollingInterval);

      return () => clearInterval(interval);
    }
  }, [pollingInterval, roochClient, loading, refetch]);

  return {
    events,
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
 * Utility function to parse event data from IndexerEventView
 */
export function parseEventData<T = any>(event: any): T | null {
  try {
    // Try decoded_event_data.value first (new format)
    if (event.decoded_event_data?.value) {
      return event.decoded_event_data.value as T;
    }
    return null;
  } catch (err) {
    console.warn('[parseEventData] Failed to parse event data:', err);
    return null;
  }
}

/**
 * Utility function to get event timestamp in milliseconds
 */
export function getEventTimestamp(event: any): number {
  // created_at is in milliseconds
  return parseInt(event.created_at);
}

/**
 * Utility function to format event type for display
 */
export function formatEventType(eventType: string): string {
  const parts = eventType.split('::');
  return parts[parts.length - 1] || eventType;
}
