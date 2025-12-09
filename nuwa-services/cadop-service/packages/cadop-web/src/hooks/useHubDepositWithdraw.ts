import { useCallback, useState } from 'react';
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
  const { data: balances, refetch: refetchBalances } = usePaymentHubBalances(agentDid || undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get unlocked balance for withdrawal
   * Unlocked balance = total balance - locked balance
   */
  const getUnlockedBalance = useCallback((): bigint => {
    if (!balances || !balances.rgas) return 0n;

    const totalBalance = BigInt(balances.rgas.balance);
    const lockedBalance = BigInt(balances.rgas.lockedBalance || 0);

    return totalBalance > lockedBalance ? totalBalance - lockedBalance : 0n;
  }, [balances]);

  /**
   * Deposit funds from account balance to Payment Hub
   */
  const depositToHub = useCallback(
    async (
      amount: bigint,
      assetId: string = DEFAULT_ASSET_ID
    ): Promise<HubOperationResult> => {
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

        return { txHash: result.txHash, success: true };
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
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
    async (
      amount: bigint,
      assetId: string = DEFAULT_ASSET_ID
    ): Promise<HubOperationResult> => {
      if (!hubClient) {
        const error = 'PaymentHub client is not ready';
        setError(error);
        return { txHash: '', success: false, error };
      }

      const unlockedBalance = getUnlockedBalance();
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
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [hubClient, getUnlockedBalance, refetchBalances]
  );

  /**
   * Withdraw all available unlocked balance from Payment Hub
   */
  const withdrawAllFromHub = useCallback(
    async (assetId: string = DEFAULT_ASSET_ID): Promise<HubOperationResult> => {
      const unlockedBalance = getUnlockedBalance();

      if (unlockedBalance <= 0n) {
        const error = 'No unlocked balance available for withdrawal';
        setError(error);
        return { txHash: '', success: false, error };
      }

      return withdrawFromHub(unlockedBalance, assetId);
    },
    [getUnlockedBalance, withdrawFromHub]
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
    totalBalance: balances?.rgas?.balance ? BigInt(balances.rgas.balance) : 0n,
    lockedBalance: balances?.rgas?.lockedBalance ? BigInt(balances.rgas.lockedBalance) : 0n,
    unlockedBalance: getUnlockedBalance(),
    activeChannels: balances?.activeCounts || 0,
  };
}