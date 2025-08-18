import { useQuery } from "@tanstack/react-query";
import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useNetworkVariable } from "./useNetworks";
import { Args, RoochAddress } from "@roochnetwork/rooch-sdk";

export default function useAddressByUsername(username?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: address,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useAddressByUsername", username],
    queryFn: async () => {
      if (!username) return null;

      const result = await client.executeViewFunction({
        target: `${packageId}::name_registry::get_address_by_username`,
        args: [Args.string(username)],
      });

      const address = result?.return_values?.[0]?.decoded_value;
      if (!address) return null;

      // Check if the address is zero
      if (
        address ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        throw new Error("404");
      }

      return new RoochAddress(String(address)).toBech32Address();
    },
    enabled: !!username,
  });

  return {
    address,
    isPending,
    isError,
    refetch,
  };
}
