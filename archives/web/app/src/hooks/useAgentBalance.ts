import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";

export default function useAgentBalance(agentAddress?: string) {
    const client = useRoochClient();

    const {
        data: balance,
        isPending,
        isError,
        refetch: refetchBalance,
    } = useQuery({
        queryKey: ['useAgentBalance', agentAddress],
        queryFn: async () => {
            if (!agentAddress) return null;
            return await client
                .getBalance({
                    owner: agentAddress,
                    coinType: '0x3::gas_coin::RGas',
                });
        },
        enabled: !!agentAddress
    });

    return {
        balance,
        isPending,
        isError,
        refetchBalance
    };
} 