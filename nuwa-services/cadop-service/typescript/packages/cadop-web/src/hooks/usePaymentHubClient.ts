import { useEffect, useState } from 'react';
import { useDIDService } from '@/hooks/useDIDService';
import { ROOCH_RPC_URL, DEFAULT_ASSET_ID } from '@/config/env';
import { RoochPaymentChannelContract, PaymentHubClient } from '@nuwa-ai/payment-kit';

export function usePaymentHubClient(agentDid?: string | null) {
  const { didService } = useDIDService(agentDid || null);
  const [client, setClient] = useState<PaymentHubClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!agentDid || !didService) {
        setClient(null);
        return;
      }
      try {
        const signer = didService.getSigner();
        const contract = new RoochPaymentChannelContract({ rpcUrl: ROOCH_RPC_URL });

        const hubClient = new PaymentHubClient({
          contract,
          signer,
          defaultAssetId: DEFAULT_ASSET_ID,
        });

        if (!disposed) {
          setClient(hubClient);
          setError(null);
        }
      } catch (e: any) {
        if (!disposed) {
          setClient(null);
          setError(e?.message || String(e));
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [agentDid, didService]);

  return { hubClient: client, error };
}


