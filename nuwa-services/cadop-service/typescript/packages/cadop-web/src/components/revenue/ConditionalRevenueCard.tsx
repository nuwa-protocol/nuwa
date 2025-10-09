import { RevenueOverviewCard } from './RevenueOverviewCard';
import { useRevenueData } from '../../hooks/useRevenueData';

interface ConditionalRevenueCardProps {
  agentDid: string;
  showTrend?: boolean;
  className?: string;
  onWithdrawSuccess?: () => void;
  isController?: boolean;
}

/**
 * A wrapper component that renders RevenueOverviewCard with controller-based permissions.
 * Revenue information is public, but withdraw functionality is only available to controllers.
 */
export function ConditionalRevenueCard({
  agentDid,
  showTrend = false,
  className = '',
  onWithdrawSuccess,
  isController = false,
}: ConditionalRevenueCardProps) {
  const { loading, error } = useRevenueData(agentDid);

  // Don't render anything while loading or if there's an error
  if (loading || error) {
    return null;
  }

  // Always render the RevenueOverviewCard, but pass controller permission
  return (
    <RevenueOverviewCard
      agentDid={agentDid}
      showTrend={showTrend}
      className={className}
      onWithdrawSuccess={onWithdrawSuccess}
      isController={isController}
    />
  );
}
