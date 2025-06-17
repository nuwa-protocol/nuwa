import { useQuery } from '@tanstack/react-query';
import { RoochClient, BalanceInfoView } from '@roochnetwork/rooch-sdk';

export interface AgentBalancesResult {
  balances: BalanceInfoView[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Extract Rooch address from DID
 * @param did DID in format 'did:rooch:<address>'
 * @returns Rooch address
 */
const getRoochAddress = (did: string | undefined): string | undefined => {
  if (!did) return undefined;
  const addressPart = did.split(':')[2];
  if (!addressPart) return undefined;
  return addressPart;
};

/**
 * Hook to fetch agent balances from Rooch network
 * @param did Agent DID in format 'did:rooch:<address>'
 * @returns Balance information and loading state
 */
export function useAgentBalances(did: string | undefined): AgentBalancesResult {
  const {
    data: balancesData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['agentBalances', did],
    queryFn: async () => {
      if (!did) throw new Error('DID is required');
      
      const address = getRoochAddress(did);
      if (!address) throw new Error('Invalid DID format');
      
      const client = new RoochClient({
        url: import.meta.env.VITE_ROOCH_RPC_URL || 'http://localhost:6767',
      });
      
      const resp = await client.getBalances({ 
        owner: address, 
        cursor: null, 
        limit: '100' 
      });
      
      return resp.data || [];
    },
    enabled: !!did,
    staleTime: 60 * 1000, // 1 minute
    retry: 1
  });

  const refetchBalances = async () => {
    await refetch();
  };

  return {
    balances: balancesData || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch: refetchBalances
  };
} 