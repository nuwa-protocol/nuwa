import { useCurrentAddress, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./useNetworks";
import { Args } from "@roochnetwork/rooch-sdk";

export default function useChannelJoinedStatus(channelId?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");
  const address = useCurrentAddress();

  const {
    data: isJoined,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useChannelJoinedStatus", channelId],
    queryFn: async () => {
      const result = await client.executeViewFunction({
        target: `${packageId}::channel::is_channel_member`,
        args: [Args.objectId(channelId!), Args.address(address!.toStr())],
      });

      const isJoined = Boolean(result?.return_values?.[0]?.decoded_value);

      return isJoined;
    },
    enabled: !!channelId && !!address,
  });

  return {
    isJoined,
    isPending,
    isError,
    refetch,
  };
}
