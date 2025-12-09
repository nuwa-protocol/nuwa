import { useCallback, useState } from 'react';
import { useDIDService } from './useDIDService';
import { Transaction, Args } from '@roochnetwork/rooch-sdk';

export interface TransferResult {
  txHash: string;
  success: boolean;
  error?: string;
}

export function useAccountTransfer(agentDid?: string | null) {
  const { didService } = useDIDService(agentDid || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transfer = useCallback(
    async (
      recipient: string,
      amount: bigint,
      coinType: string = '0x3::rgas::RGAS'
    ): Promise<TransferResult> => {
      if (!didService) {
        const error = 'DID service not available';
        setError(error);
        return { txHash: '', success: false, error };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get the signer from DID service
        const signer = didService.getSigner();

        // Create and configure the transaction
        const tx = new Transaction();

        // Call the account_coin_store::transfer function
        tx.callFunction({
          target: '0x3::account_coin_store::transfer',
          typeArgs: [coinType],
          args: [Args.address(recipient), Args.u256(amount)],
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

        return { txHash, success: true };
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        setError(errorMessage);
        return { txHash: '', success: false, error: errorMessage };
      } finally {
        setIsLoading(false);
      }
    },
    [didService]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    transfer,
    isLoading,
    error,
    clearError,
  };
}