import { useCallback, useEffect, useState } from 'react';
import { usePaymentHubClient } from './usePaymentHubClient';
import { usePaymentHubBalances } from './usePaymentHubBalances';
import { DEFAULT_ASSET_ID } from '@/config/env';

export interface HubTransferResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export function useHubTransfer(agentDid?: string | null) {
  const { hubClient } = usePaymentHubClient(agentDid || undefined);
  const { balances, activeCounts, refetch } = usePaymentHubBalances(agentDid || undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockedBalance, setUnlockedBalance] = useState<bigint>(0n);

  const totalBalance = balances?.[DEFAULT_ASSET_ID]
    ? BigInt(balances[DEFAULT_ASSET_ID])
    : 0n;

  useEffect(() => {
    const refreshUnlockedBalance = async () => {
      if (!hubClient || !agentDid) return;
      try {
        const latest = await hubClient.getUnlockedBalance({
          ownerDid: agentDid,
          assetId: DEFAULT_ASSET_ID,
        });
        setUnlockedBalance(latest);
      } catch {
        setUnlockedBalance(0n);
      }
    };

    refreshUnlockedBalance();
  }, [hubClient, agentDid, totalBalance]);

  /**
   * Transfer funds from sender's Payment Hub to receiver's Payment Hub
   * This uses the contract's transfer_to_hub_entry function
   */
  const transfer = useCallback(
    async (
      recipientDid: string,
      amount: bigint,
      assetId: string = DEFAULT_ASSET_ID
    ): Promise<HubTransferResult> => {
      if (!hubClient) {
        const error = 'PaymentHub client is not ready';
        setError(error);
        return { txHash: '', success: false, error };
      }

      if (!agentDid) {
        const error = 'Agent DID is required';
        setError(error);
        return { txHash: '', success: false, error };
      }

      setIsLoading(true);
      setError(null);

      try {
        const available = await hubClient.getUnlockedBalance({
          ownerDid: agentDid,
          assetId,
        });

        if (amount > available) {
          const error = `Insufficient unlocked balance. Available: ${available.toString()}`;
          setError(error);
          return { txHash: '', success: false, error };
        }

        const result = await hubClient.transfer(recipientDid, assetId, amount);
        await refetch();
        setUnlockedBalance(await hubClient.getUnlockedBalance({ ownerDid: agentDid, assetId }));
        return { txHash: result.txHash, success: true };
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [hubClient, agentDid, refetch]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    transfer,
    isLoading,
    error,
    clearError,
    unlockedBalance,
    totalBalance,
    lockedBalance: totalBalance > unlockedBalance ? totalBalance - unlockedBalance : 0n,
    activeChannels: activeCounts?.[DEFAULT_ASSET_ID] || 0,
  };
}