import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./useNetworks";
import { Args } from "@roochnetwork/rooch-sdk";

export default function useUserNameCheck(name: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: available,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useUserNameCheck", name],
    queryFn: async () => {
      if (name.length < 4 || name.length > 16) {
        return {
          error: "Username must be between 4-16 characters",
          isAvailable: false,
        };
      }

      if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        return {
          error: "Username can only contain letters, numbers, and underscores",
          isAvailable: false,
        };
      }

      if (/^\d+$/.test(name)) {
        return {
          error: "Username cannot be all numbers",
          isAvailable: false,
        };
      }

      const result = await client.executeViewFunction({
        target: `${packageId}::name_registry::is_username_available`,
        args: [Args.string(name)],
      });

      const isAvailable = result?.return_values?.[0]?.decoded_value || false;

      if (!isAvailable) {
        return {
          error: "This username is already taken, please choose another one",
          isAvailable: false,
        };
      }

      return {
        isAvailable: true,
      };
    },
  });

  return {
    available,
    isPending,
    isError,
    refetch,
  };
}
