import { useCallback, useEffect, useState } from 'react';
import { usePaymentHubClient } from './usePaymentHubClient';
import { usePaymentHubBalances } from './usePaymentHubBalances';
import { DEFAULT_ASSET_ID } from '@/config/env';

export interface HubOperationResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export function useHubDepositWithdraw(agentDid?: string | null) {
  const { hubClient } = usePaymentHubClient(agentDid || undefined);
  const {
    balances,
    activeCounts,
    refetch: refetchBalances,
  } = usePaymentHubBalances(agentDid || undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalBalance, setTotalBalance] = useState<bigint>(0n);
  const [unlockedBalance, setUnlockedBalance] = useState<bigint>(0n);
  const [lockedBalance, setLockedBalance] = useState<bigint>(0n);
  const [activeChannels, setActiveChannels] = useState<number>(0);

  // Refresh derived balances when raw balances change
  useEffect(() => {
    const refresh = async () => {
      if (!hubClient || !agentDid) return;

      const total = balances?.[DEFAULT_ASSET_ID] ? BigInt(balances[DEFAULT_ASSET_ID]) : 0n;
      const unlocked = await hubClient.getUnlockedBalance({
        ownerDid: agentDid,
        assetId: DEFAULT_ASSET_ID,
      });
      setTotalBalance(total);
      setUnlockedBalance(unlocked);
      setLockedBalance(total > unlocked ? total - unlocked : 0n);
      setActiveChannels(activeCounts?.[DEFAULT_ASSET_ID] || 0);
    };

    refresh();
  }, [hubClient, agentDid, balances, activeCounts]);

  /**
   * Deposit funds from account balance to Payment Hub
   */
  const depositToHub = useCallback(
    async (amount: bigint, assetId: string = DEFAULT_ASSET_ID): Promise<HubOperationResult> => {
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
        const result = await hubClient.deposit(assetId, amount, agentDid);

        // Refresh balances after successful deposit
        await refetchBalances();
        const total = balances?.[assetId] ? BigInt(balances[assetId]) + amount : amount;
        setTotalBalance(total);
        // unlocked/locked will refresh via effect

        return { txHash: result.txHash, success: true };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [hubClient, agentDid, refetchBalances]
  );

  /**
   * Withdraw funds from Payment Hub to account balance
   * Only allows withdrawal of unlocked balance
   */
  const withdrawFromHub = useCallback(
    async (amount: bigint, assetId: string = DEFAULT_ASSET_ID): Promise<HubOperationResult> => {
      if (!hubClient) {
        const error = 'PaymentHub client is not ready';
        setError(error);
        return { txHash: '', success: false, error };
      }

      if (amount > unlockedBalance) {
        const error = `Insufficient unlocked balance. Available: ${unlockedBalance.toString()}`;
        setError(error);
        return { txHash: '', success: false, error };
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await hubClient.withdraw(assetId, amount);

        // Refresh balances after successful withdrawal
        await refetchBalances();

        return { txHash: result.txHash, success: true };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [hubClient, unlockedBalance, refetchBalances]
  );

  /**
   * Withdraw all available unlocked balance from Payment Hub
   */
  const withdrawAllFromHub = useCallback(
    async (assetId: string = DEFAULT_ASSET_ID): Promise<HubOperationResult> => {
      if (unlockedBalance <= 0n) {
        const error = 'No unlocked balance available for withdrawal';
        setError(error);
        return { txHash: '', success: false, error };
      }

      return withdrawFromHub(unlockedBalance, assetId);
    },
    [unlockedBalance, withdrawFromHub]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    depositToHub,
    withdrawFromHub,
    withdrawAllFromHub,
    isLoading,
    error,
    clearError,
    // Balance information
    totalBalance,
    lockedBalance,
    unlockedBalance,
    activeChannels,
  };
}
