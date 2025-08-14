import { useCallback, useEffect, useState } from 'react';
import { usePaymentHubClient } from './usePaymentHubClient';

export function usePaymentHubBalances(agentDid?: string | null) {
  const { hubClient } = usePaymentHubClient(agentDid || undefined);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!hubClient || !agentDid) return;
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        hubClient.getAllBalances(agentDid),
        hubClient.getActiveChannelsCounts(agentDid),
      ]);
      setBalances(b);
      setActiveCounts(c);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [hubClient, agentDid]);

  useEffect(() => {
    if (hubClient && agentDid) {
      refetch();
    }
  }, [hubClient, agentDid, refetch]);

  return { balances, activeCounts, loading, error, refetch };
}


