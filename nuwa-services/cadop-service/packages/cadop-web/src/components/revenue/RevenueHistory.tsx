import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Select,
} from '@/components/ui';
import {
  History,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Plus,
  Filter,
} from 'lucide-react';
import {
  useRevenueHistory,
  formatTimestamp,
  getRelativeTime,
  getAssetSymbol,
} from '@/hooks/useRevenueHistory';
import type { RevenueHistoryFilter } from '@/hooks/useRevenueHistory';

interface RevenueHistoryProps {
  agentDid: string;
  className?: string;
  showStats?: boolean;
  maxItems?: number;
  onViewAll?: () => void;
}

export function RevenueHistory({
  agentDid,
  className = '',
  showStats = true,
  maxItems,
  onViewAll,
}: RevenueHistoryProps) {
  const [_filter, _setFilter] = useState<RevenueHistoryFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [timeRange, setTimeRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'deposited' | 'withdrawn'>('all');

  // Calculate time filter
  const timeFilter = React.useMemo(() => {
    const now = Date.now();
    switch (timeRange) {
      case '24h':
        return { timeFrom: now - 24 * 60 * 60 * 1000 };
      case '7d':
        return { timeFrom: now - 7 * 24 * 60 * 60 * 1000 };
      case '30d':
        return { timeFrom: now - 30 * 24 * 60 * 60 * 1000 };
      default:
        return {};
    }
  }, [timeRange]);

  // Build complete filter
  const completeFilter = React.useMemo(
    (): RevenueHistoryFilter => ({
      ..._filter,
      ...timeFilter,
      eventTypes:
        eventTypeFilter === 'all'
          ? undefined
          : eventTypeFilter === 'deposited'
            ? ['0x3::payment_revenue::RevenueDepositedEvent']
            : ['0x3::payment_revenue::RevenueWithdrawnEvent'],
    }),
    [_filter, timeFilter, eventTypeFilter]
  );

  const { historyItems, stats, loading, error, hasNextPage, refetch, fetchNextPage } =
    useRevenueHistory(agentDid, completeFilter);

  // Limit items if maxItems is specified
  const displayItems = maxItems ? historyItems.slice(0, maxItems) : historyItems;
  const hasMoreItems = maxItems && historyItems.length > maxItems;

  const handleRefresh = () => {
    refetch();
  };

  const handleLoadMore = () => {
    if (hasNextPage) {
      fetchNextPage();
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'deposited':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'withdrawn':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'hub_created':
        return <Plus className="h-4 w-4 text-blue-600" />;
      default:
        return <History className="h-4 w-4 text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'deposited':
        return 'text-green-600';
      case 'withdrawn':
        return 'text-red-600';
      case 'hub_created':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading && historyItems.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Revenue History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`border-red-200 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <History className="h-5 w-5" />
            Revenue History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-red-600 text-sm mb-2">Failed to load revenue history</p>
            <p className="text-gray-500 text-xs mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Revenue History
            {historyItems.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {historyItems.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Select
              value={timeRange}
              onValueChange={(value: 'all' | '24h' | '7d' | '30d') => setTimeRange(value)}
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </Select>
            <Select
              value={eventTypeFilter}
              onValueChange={(value: 'all' | 'deposited' | 'withdrawn') =>
                setEventTypeFilter(value)
              }
            >
              <option value="all">All Events</option>
              <option value="deposited">Deposits Only</option>
              <option value="withdrawn">Withdrawals Only</option>
            </Select>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Statistics */}
        {showStats && historyItems.length > 0 && (
          <div className="grid grid-cols-1 gap-4 mb-6 p-4 bg-gray-50 rounded-lg max-w-xs">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-800">{stats.estimatedTotal}</div>
              <div className="text-xs text-gray-500">Total Transactions</div>
            </div>
          </div>
        )}

        {/* History Items */}
        {displayItems.length > 0 ? (
          <div className="space-y-2">
            {displayItems.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">{getEventIcon(item.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${getEventColor(item.type)}`}>
                          {item.typeDisplay}
                        </span>
                        {item.amountDisplay && (
                          <span className="text-sm font-mono font-semibold">
                            {item.amountDisplay} {getAssetSymbol(item.assetId)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Additional details */}
                    <div className="text-xs text-gray-600 mt-1 space-y-1">
                      <div className="flex items-center gap-4">
                        <span>
                          {getRelativeTime(item.timestamp)} • {formatTimestamp(item.timestamp)}
                        </span>
                      </div>

                      {/* Show source information for deposited events */}
                      {item.type === 'deposited' && (item.sourceId || item.sourceType) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Source:</span>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {item.sourceType || 'Unknown'}
                          </span>
                          {item.sourceDescription && (
                            <span className="text-xs text-gray-600">
                              • {item.sourceDescription}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Show source_id (channel_id) for payment_channel */}
                      {item.sourceId && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            {item.sourceType === 'payment_channel' ? 'Channel:' : 'Source ID:'}
                          </span>
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                            {item.sourceId.slice(0, 8)}...{item.sourceId.slice(-6)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">TX:</span>
                        <span className="font-mono text-xs">
                          {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Open transaction in block explorer
                      const explorerUrl = `https://test.roochscan.io/tx/${item.txHash}`;
                      window.open(explorerUrl, '_blank');
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Load More / View All */}
            <div className="flex justify-center pt-4">
              {hasMoreItems && onViewAll && (
                <Button variant="outline" onClick={onViewAll}>
                  View All ({historyItems.length} total)
                </Button>
              )}
              {!hasMoreItems && hasNextPage && (
                <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <History className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm mb-2">No revenue history yet</p>
            <p className="text-gray-400 text-xs">
              Revenue transactions will appear here once services start generating income.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
