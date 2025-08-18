import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { Channel, CHANNEL_STATUS } from "@/types/channel";

export default function useChannel(id?: string) {
  const client = useRoochClient();

  const {
    data: channelInfo,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useChannel", id],
    queryFn: async () => {
      const result = await client.queryObjectStates({
        filter: {
          object_id: id!,
        },
      });
      console.log("chan info", result);
      const channel = result?.data?.[0]?.decoded_value?.value;

      const isChannelActive = channel?.status === CHANNEL_STATUS.ACTIVE;
      let aiAddress = channel?.creator as string;

      return {
        title: channel?.title,
        active: isChannelActive,
        createdAt: channel?.created_at,
        creator: channel?.creator,
        joinPolicy: channel?.join_policy,
        lastActive: channel?.last_active,
        membersTable: channel?.members,
        message_counter: channel?.message_counter,
        messageTable: channel?.messages,
        parentChannel: channel?.parent_channel,
        status: channel?.status,
        // createAt: last_active,
        agentAddress: aiAddress,
      } as Channel;
    },
    enabled: !!id,
  });

  return {
    channelInfo,
    isPending,
    isError,
    refetch,
  };
}
