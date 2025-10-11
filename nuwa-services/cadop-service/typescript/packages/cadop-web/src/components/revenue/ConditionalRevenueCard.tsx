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
 * A wrapper component that conditionally renders RevenueOverviewCard based on revenue hub existence.
 * Only shows the revenue card if the user has a revenue object (hub exists), even if balance is 0.
 * Revenue information is public, but withdraw functionality is only available to controllers.
 */
export function ConditionalRevenueCard({
  agentDid,
  showTrend = false,
  className = '',
  onWithdrawSuccess,
  isController = false,
}: ConditionalRevenueCardProps) {
  const { loading, error, hubExists } = useRevenueData(agentDid);

  // Don't render anything while loading or if there's an error
  if (loading || error) {
    return null;
  }

  // Only render if revenue hub exists (revenue object exists)
  // This means we show the card even if balance is 0, as long as the hub exists
  if (!hubExists) {
    return null;
  }

  // Render the RevenueOverviewCard with controller permission
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
