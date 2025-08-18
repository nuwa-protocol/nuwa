import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./useNetworks";
import { UserInfo } from "../types/user";

export default function useUserInfo(address?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: userInfo,
    isPending,
    isError,
    refetch,
  } = useQuery<UserInfo>({
    queryKey: ["useUserInfo", address],
    queryFn: async () => {
      const resultA = await client.queryObjectStates({
        filter: {
          object_type_with_owner: {
            object_type: `${packageId}::user_profile::UserProfile`,
            owner: address!,
          },
        },
      });
      const id = String(resultA.data[0]?.id || "");
      const username = String(
        resultA.data[0]?.decoded_value?.value?.username || ""
      );
      const name = String(resultA.data[0]?.decoded_value?.value?.name || "");
      const avatar = String(
        resultA.data[0]?.decoded_value?.value?.avatar ||
          `https://api.dicebear.com/9.x/dylan/svg?seed=+${username}`
      );

      return {
        id,
        username,
        name,
        avatar,
      };
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60, // 1 hour
    enabled: !!address,
  });

  return {
    userInfo,
    isPending,
    isError,
    refetch,
  };
}
