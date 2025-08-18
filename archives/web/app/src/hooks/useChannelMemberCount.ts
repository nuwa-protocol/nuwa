import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";

export default function useChannelMemberCount(channelId?: string) {
  const client = useRoochClient();

  const {
    data: memberCount,
    isPending,
    isError,
    refetch,
  } = useQuery<number>({
    queryKey: ["useChannelMembers", channelId],
    queryFn: async () => {
      const result = await client.queryObjectStates({
        filter: {
          object_id: channelId!,
        },
      });

      const decode = result.data[0].decoded_value?.value as any;

      const table = decode.members.value.handle.value.id;

      const countResult = await client.queryObjectStates({
        filter: {
          object_id: table
        }
      })

      return Number(countResult.data[0].size)
    },
    enabled: !!channelId,
  });

  return {
    memberCount,
    isPending,
    isError,
    refetch,
  };
}
