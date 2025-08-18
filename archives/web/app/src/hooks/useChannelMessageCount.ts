import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./useNetworks";
import { Args } from "@roochnetwork/rooch-sdk";

export default function useChannelMessageCount(channelId?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: messageCount,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useChannelMessagesCount", channelId],
    queryFn: async () => {
      const result = await client.executeViewFunction({
        target: `${packageId}::channel::get_message_count`,
        args: [Args.objectId(channelId || "")],
      });

      const count = result?.return_values?.[0]?.decoded_value as number;

      return count;
    },
    refetchInterval: 2000,
    enabled: !!channelId,
  });

  return {
    messageCount: messageCount || 0,
    isPending,
    isError,
    refetch,
  };
}
