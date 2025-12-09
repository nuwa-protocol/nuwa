import { useCallback, useState } from 'react';
import { usePaymentHubClient } from './usePaymentHubClient';
import { usePaymentHubBalances } from './usePaymentHubBalances';
import { normalizeAddress, didToAddress } from '@/utils/addressValidation';
import { DEFAULT_ASSET_ID } from '@/config/env';
import { Transaction, Args } from '@roochnetwork/rooch-sdk';
import { RoochPaymentChannelContract } from '@nuwa-ai/payment-kit';

export interface HubTransferResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export function useHubTransfer(agentDid?: string | null) {
  const { hubClient } = usePaymentHubClient(agentDid || undefined);
  const { data: balances, refetch } = usePaymentHubBalances(agentDid || undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get unlocked balance (total balance minus locked balance)
   * Unlocked balance = total balance - (active channels * lock amount per channel)
   */
  const getUnlockedBalance = useCallback((): bigint => {
    if (!balances || !balances.rgas) return 0n;

    const totalBalance = BigInt(balances.rgas.balance);
    const lockedBalance = BigInt(balances.rgas.lockedBalance || 0);

    return totalBalance > lockedBalance ? totalBalance - lockedBalance : 0n;
  }, [balances]);

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

      const unlockedBalance = getUnlockedBalance();
      if (amount > unlockedBalance) {
        const error = `Insufficient unlocked balance. Available: ${unlockedBalance.toString()}`;
        setError(error);
        return { txHash: '', success: false, error };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get the contract from the hub client
        const contract = hubClient.contract;

        // Get the signer from hub client
        const signer = hubClient.signer;

        // Convert recipient DID to address
        const recipientAddress = didToAddress(recipientDid);

        // Create and configure the transaction
        const tx = new Transaction();

        // Call the payment_channel::transfer_to_hub_entry function
        tx.callFunction({
          target: `${contract.contractAddress}::payment_channel::transfer_to_hub_entry`,
          typeArgs: [assetId],
          args: [Args.address(recipientAddress), Args.u256(amount)],
          maxGas: 100000000, // Set appropriate gas limit
        });

        // Execute the transaction
        const result = await signer.signAndExecuteTransaction({
          transaction: tx,
        });

        // Check if the transaction was successful
        const success = result.execution_info.status.type === 'executed';
        const txHash = result.execution_info.tx_hash || '';

        if (!success) {
          const errorMsg = `Transaction failed: ${result.execution_info.status.type}`;
          setError(errorMsg);
          return { txHash, success: false, error: errorMsg };
        }

        // Refresh balances after successful transfer
        refetch();

        return { txHash, success: true };
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [hubClient, agentDid, getUnlockedBalance, refetch]
  );

  /**
   * Alternative implementation using direct contract calls
   * This is a fallback method in case the above approach doesn't work
   */
  const transferAlternative = useCallback(
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
        // Create a new contract instance if needed
        const contract = new RoochPaymentChannelContract({
          rpcUrl: process.env.VITE_ROOCH_RPC_URL || 'https://rpc.devnet.rooch.network'
        });

        // Get the signer from hub client
        const signer = hubClient.signer;

        // Use the contract's built-in transferToHub method if available
        // This would require the PaymentKit to be extended with this method
        if ('transferToHub' in contract) {
          // @ts-ignore - This method may not exist in current version
          const result = await contract.transferToHub({
            senderDid: agentDid,
            receiverDid: recipientDid,
            assetId,
            amount,
            signer,
          });

          refetch();
          return { txHash: result.txHash, success: true };
        } else {
          // Fallback to manual transaction construction
          throw new Error('Transfer to hub method not available in current PaymentKit version');
        }
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
    transferAlternative,
    isLoading,
    error,
    clearError,
    unlockedBalance: getUnlockedBalance(),
    totalBalance: balances?.rgas?.balance ? BigInt(balances.rgas.balance) : 0n,
    lockedBalance: balances?.rgas?.lockedBalance ? BigInt(balances.rgas.lockedBalance) : 0n,
    activeChannels: balances?.activeCounts || 0,
  };
}