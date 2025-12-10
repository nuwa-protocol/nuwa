import { useCallback, useState } from 'react';
import { useDIDService } from './useDIDService';
import { Transaction, Args, RoochClient } from '@roochnetwork/rooch-sdk';
import { DidAccountSigner } from '@nuwa-ai/identity-kit';
import { ROOCH_RPC_URL, DEFAULT_ASSET_ID } from '@/config/env';

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
      coinType: string = DEFAULT_ASSET_ID
    ): Promise<TransferResult> => {
      if (!didService) {
        const error = 'DID service not available';
        setError(error);
        return { txHash: '', success: false, error };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get the signer from DID service and convert to Rooch signer
        const signer = didService.getSigner();
        console.log('signer keys: ', await signer.listKeyIds());
        const roochSigner = await DidAccountSigner.create(signer);

        // Rooch client
        const client = new RoochClient({ url: ROOCH_RPC_URL });

        // Create and configure the transaction
        const tx = new Transaction();

        // Call the transfer::transfer_coin function
        tx.callFunction({
          target: '0x3::transfer::transfer_coin',
          typeArgs: [coinType],
          args: [Args.address(recipient), Args.u256(amount)],
          maxGas: 100000000, // Set appropriate gas limit
        });

        // Execute the transaction
        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: roochSigner,
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
