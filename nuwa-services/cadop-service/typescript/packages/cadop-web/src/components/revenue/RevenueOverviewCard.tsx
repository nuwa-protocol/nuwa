import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Activity, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Skeleton } from '@/components/ui';
import { useRevenueData } from '@/hooks/useRevenueData';
import { WithdrawRevenueModal } from './WithdrawRevenueModal';
import { formatUSD, formatTokenAmount } from '@/utils/formatters';

interface RevenueOverviewCardProps {
  agentDid: string;
  showTrend?: boolean;
  className?: string;
  onWithdrawSuccess?: () => void;
  isController?: boolean;
}

export function RevenueOverviewCard({
  agentDid,
  showTrend = false,
  className = '',
  onWithdrawSuccess,
  isController = false,
}: RevenueOverviewCardProps) {
  const navigate = useNavigate();
  const { balances, totalUSD, loading, error, refetch } = useRevenueData(agentDid);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const handleWithdrawSuccess = () => {
    setShowWithdrawModal(false);
    refetch(); // Refresh revenue data
    onWithdrawSuccess?.(); // Refresh agent balance data
  };

  if (loading) {
    return (
      <Card className={`revenue-overview ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Revenue Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center space-y-2">
              <Skeleton className="h-8 w-20 mx-auto" />
              <Skeleton className="h-4 w-16 mx-auto" />
              <Skeleton className="h-3 w-12 mx-auto" />
            </div>
            <div className="text-center space-y-2">
              <Skeleton className="h-8 w-16 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto" />
            </div>
            <div className="text-center">
              <Skeleton className="h-10 w-24 mx-auto" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`revenue-overview border-red-200 ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <DollarSign className="h-5 w-5" />
            Revenue Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-red-600 text-sm mb-2">Failed to load revenue data</p>
            <p className="text-gray-500 text-xs mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalUSDFormatted = formatUSD(totalUSD);
  const hasRevenue = balances.length > 0 && balances.some(b => b.balance > 0n);
  const primaryBalance = balances[0];

  return (
    <>
      <Card className={`revenue-overview ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Revenue Overview
            {hasRevenue && (
              <Badge variant="secondary" className="ml-auto">
                <Activity className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Revenue - RGAS with USD value */}
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {primaryBalance
                  ? formatTokenAmount(primaryBalance.balance, primaryBalance.decimals)
                  : '0'}{' '}
                {primaryBalance?.symbol || 'RGAS'}
              </div>
              <div className="text-sm text-gray-500">${totalUSDFormatted}</div>
              <div className="text-xs text-gray-400">Total Revenue</div>
            </div>

            {/* Revenue Status */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {hasRevenue ? 'Available' : 'None'}
              </div>
              <div className="text-sm text-gray-500">Status</div>
            </div>

            {/* Action Buttons */}
            <div className="text-center space-y-2">
              {hasRevenue && isController && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWithdrawModal(true)}
                  className="w-full"
                >
                  Withdraw
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/agent/${agentDid}/revenue-history`)}
                className="w-full"
              >
                <History className="mr-2 h-4 w-4" />
                View History
              </Button>
            </div>
          </div>

          {/* Trend Chart Placeholder */}
          {showTrend && hasRevenue && (
            <div className="mt-4 pt-4 border-t">{/* TODO: Add trend chart */}</div>
          )}

          {/* No Revenue State */}
          {!hasRevenue && (
            <div className="mt-4 pt-4 border-t text-center">
              <div className="text-gray-500 text-sm mb-2">
                No revenue yet.{' '}
                {isController
                  ? 'Configure your services to start earning.'
                  : 'Services not configured yet.'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdraw Modal */}
      {showWithdrawModal && primaryBalance && (
        <WithdrawRevenueModal
          agentDid={agentDid}
          availableBalances={balances}
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={handleWithdrawSuccess}
        />
      )}
    </>
  );
}
