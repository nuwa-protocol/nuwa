import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { Args } from "@roochnetwork/rooch-sdk";
import { useNetworkVariable } from "./useNetworks";

export default function useAgentChannel(id?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: channels,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useAgentChannels", id],
    queryFn: async () => {
      const result = await client.executeViewFunction({
        target: `${packageId}::channel::get_agent_home_channel_id`,
        args: [Args.objectId(id!)],
      });

      const channelId = result?.return_values?.[0]?.decoded_value as string;
      const channelResult = await client.queryObjectStates({
        filter: {
          object_id: channelId!,
        },
      });

      const channelValue = channelResult.data[0]?.decoded_value?.value as any;

      const topics = await client.listStates({
        accessPath: `/table/${channelValue.topics.value.handle.value.id}`,
      });

      const channels = [
        {
          title: channelValue.title,
          id: channelId,
        },
      ].concat(
        topics.data
          .sort(
            (b, a) => Number(a.state.updated_at) - Number(b.state.updated_at)
          )
          .map((item) => {
            return {
              title: item.state.decoded_value?.value.name as string,
              id: item.state.decoded_value?.value.value as string,
            };
          })
      );

      return channels;
    },
    enabled: !!id,
  });

  return {
    channels,
    isPending,
    isError,
    refetch,
  };
}
