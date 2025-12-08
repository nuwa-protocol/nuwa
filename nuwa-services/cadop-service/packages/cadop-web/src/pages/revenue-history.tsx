import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Alert,
  AlertTitle,
  AlertDescription,
  Input,
  Select,
  Badge,
} from '@/components/ui';
import {
  ArrowLeft,
  Download,
  Filter,
  Search,
  History,
  TrendingUp,
  TrendingDown,
  Plus,
  ExternalLink,
} from 'lucide-react';
import {
  useRevenueHistory,
  formatTimestamp,
  getAssetSymbol,
  getRelativeTime,
} from '@/hooks/useRevenueHistory';
import type { RevenueHistoryFilter } from '@/hooks/useRevenueHistory';

export function RevenueHistoryPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<RevenueHistoryFilter>({});
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState<'all' | '24h' | '7d' | '30d' | '90d'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<
    'all' | 'deposited' | 'withdrawn' | 'hub_created'
  >('all');

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
      case '90d':
        return { timeFrom: now - 90 * 24 * 60 * 60 * 1000 };
      default:
        return {};
    }
  }, [timeRange]);

  // Build complete filter
  const completeFilter = React.useMemo(
    (): RevenueHistoryFilter => ({
      ...filter,
      ...timeFilter,
      eventTypes:
        eventTypeFilter === 'all'
          ? undefined
          : eventTypeFilter === 'deposited'
            ? ['0x3::payment_revenue::RevenueDepositedEvent']
            : eventTypeFilter === 'withdrawn'
              ? ['0x3::payment_revenue::RevenueWithdrawnEvent']
              : eventTypeFilter === 'hub_created'
                ? ['0x3::payment_revenue::RevenueHubCreatedEvent']
                : undefined,
    }),
    [filter, timeFilter, eventTypeFilter]
  );

  const { historyItems, stats, loading, error, hasNextPage, fetchNextPage } = useRevenueHistory(
    did,
    completeFilter,
    {
      limit: 50, // Show more items on dedicated page
      pollingInterval: 30000,
    }
  );

  // Filter items by search term
  const filteredItems = React.useMemo(() => {
    if (!searchTerm) return historyItems;

    const term = searchTerm.toLowerCase();
    return historyItems.filter(
      item =>
        item.typeDisplay.toLowerCase().includes(term) ||
        item.txHash.toLowerCase().includes(term) ||
        item.hubId.toLowerCase().includes(term) ||
        (item.relatedAddress && item.relatedAddress.toLowerCase().includes(term))
    );
  }, [historyItems, searchTerm]);

  const handleExportData = () => {
    // Create CSV data
    const headers = ['Timestamp', 'Type', 'Amount', 'Asset', 'Address', 'Transaction Hash'];
    const csvData = [
      headers.join(','),
      ...filteredItems.map(item =>
        [
          formatTimestamp(item.timestamp),
          item.typeDisplay,
          item.amount ? item.amount.toString() : '',
          getAssetSymbol(item.assetId),
          item.relatedAddress || '',
          item.txHash,
        ]
          .map(field => `"${field}"`)
          .join(',')
      ),
    ].join('\n');

    // Download CSV file
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-history-${did}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setFilter({});
    setSearchTerm('');
    setTimeRange('all');
    setEventTypeFilter('all');
  };

  if (!did) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Agent DID is required</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(`/agent/${did}`)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>

          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Revenue History</h1>
              <p className="text-gray-600 mt-1">Complete transaction history for {did}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={filteredItems.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          {!loading && !error && historyItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6 max-w-xs">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-gray-800">{stats.estimatedTotal}</div>
                  <div className="text-sm text-gray-500">Total Transactions</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Advanced Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search transactions..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Time Range</label>
                    <Select
                      value={timeRange}
                      onValueChange={(value: 'all' | '24h' | '7d' | '30d') => setTimeRange(value)}
                    >
                      <option value="all">All Time</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="90d">Last 90 Days</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Event Type</label>
                    <Select
                      value={eventTypeFilter}
                      onValueChange={(value: 'all' | 'deposited' | 'withdrawn' | 'hub_created') =>
                        setEventTypeFilter(value)
                      }
                    >
                      <option value="all">All Events</option>
                      <option value="deposited">Deposits</option>
                      <option value="withdrawn">Withdrawals</option>
                      <option value="hub_created">Hub Created</option>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" onClick={resetFilters} className="w-full">
                      Reset Filters
                    </Button>
                  </div>
                </div>

                {/* Active Filters Display */}
                {(searchTerm || timeRange !== 'all' || eventTypeFilter !== 'all') && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                    <span className="text-sm text-gray-500">Active filters:</span>
                    {searchTerm && <Badge variant="secondary">Search: {searchTerm}</Badge>}
                    {timeRange !== 'all' && <Badge variant="secondary">Time: {timeRange}</Badge>}
                    {eventTypeFilter !== 'all' && (
                      <Badge variant="secondary">Type: {eventTypeFilter}</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Revenue History Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Revenue History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredItems.length > 0 ? (
                <div className="space-y-2">
                  {filteredItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {item.type === 'deposited' ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : item.type === 'withdrawn' ? (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <Plus className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  item.type === 'deposited'
                                    ? 'text-green-600'
                                    : item.type === 'withdrawn'
                                      ? 'text-red-600'
                                      : 'text-blue-600'
                                }`}
                              >
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
                                {getRelativeTime(item.timestamp)} •{' '}
                                {formatTimestamp(item.timestamp)}
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
                                  {item.sourceType === 'payment_channel'
                                    ? 'Channel:'
                                    : 'Source ID:'}
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

                  {/* Load More Button */}
                  {hasNextPage && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" onClick={fetchNextPage} disabled={loading}>
                        {loading ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}
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

          {/* Results Summary */}
          {!loading && (
            <div className="text-center text-sm text-gray-500">
              Showing {stats.loadedCount} of {stats.estimatedTotal} transactions
              {searchTerm && ` (${filteredItems.length} matching "${searchTerm}")`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
