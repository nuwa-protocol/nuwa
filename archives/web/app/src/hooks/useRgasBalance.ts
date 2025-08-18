import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { RgasBalance } from "../types/user";
import { RoochAddress } from "@roochnetwork/rooch-sdk";

export default function useRgasBalance(address: string | undefined): RgasBalance {
  const client = useRoochClient()

  const {
    data: rGas,
    isPending,
    isError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ['useRgas', address],
    queryFn: async () => {
      return await client
        .getBalance({
          owner: new RoochAddress(address!).toBech32Address(),
          coinType: '0x3::gas_coin::RGas',
        })
    },
    enabled: !!address
  })

  return {

    balance: rGas ? (rGas?.fixedBalance || 0) : undefined,
    isPending,
    isError,
    refetchBalance
  }
}