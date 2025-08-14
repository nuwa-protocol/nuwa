import { useCallback, useState } from 'react';
import { DEFAULT_ASSET_ID } from '@/config/env';
import { usePaymentHubClient } from './usePaymentHubClient';

export function useHubDeposit(agentDid?: string | null) {
  const { hubClient } = usePaymentHubClient(agentDid || undefined);
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depositRaw = useCallback(
    async (amount: bigint, assetId: string = DEFAULT_ASSET_ID): Promise<{ txHash: string } | null> => {
      if (!hubClient) throw new Error('PaymentHub client is not ready');
      if (amount <= 0n) return null;
      setDepositing(true);
      setError(null);
      try {
        const res = await hubClient.deposit(assetId, amount);
        return res;
      } catch (e: any) {
        setError(e?.message || String(e));
        throw e;
      } finally {
        setDepositing(false);
      }
    },
    [hubClient]
  );

  const depositPercentOfClaimed = useCallback(
    async (
      claimedRaw: number | bigint,
      percent: number,
      assetId: string = DEFAULT_ASSET_ID
    ): Promise<{ txHash: string } | null> => {
      const claimed = typeof claimedRaw === 'bigint' ? claimedRaw : BigInt(claimedRaw);
      const amount = (claimed * BigInt(Math.floor(percent))) / 100n;
      return depositRaw(amount, assetId);
    },
    [depositRaw]
  );

  return { depositRaw, depositPercentOfClaimed, depositing, error };
}


