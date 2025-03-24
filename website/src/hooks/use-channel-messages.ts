import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./use-networks";
import { Args, bcs } from "@roochnetwork/rooch-sdk";
import { Message } from "../types/channel";

export const ObjectIDSchema = bcs.struct("ObjectID", {
  id: bcs.vector(bcs.Address),
});

export default function useChannelMessages(input: {
  channelId: string;
  page: number;
  size: number;
}) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: messages,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useChannelMessages", input],
    queryFn: async () => {
      const result = await client.executeViewFunction({
        target: `${packageId}::channel::get_messages_paginated`,
        args: [
          Args.objectId(input.channelId),
          Args.u64(BigInt(input.page * input.size)),
          Args.u64(BigInt(input.size)),
        ],
      });

      if (!result?.return_values?.[0]?.value) {
        return [];
      }

      let hexIds = result.return_values[0].value.value;

      const cleanHexValue = hexIds.startsWith("0x") ? hexIds.slice(2) : hexIds;
      const bytes = new Uint8Array(
        cleanHexValue.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const parsed = bcs.vector(ObjectIDSchema).parse(bytes);
      const ids = parsed.map((id) =>
        // Join the address array into a single string
        //TODO fixme
        Array.isArray(id.id) ? id.id.join("") : id.id
      );

      if (ids.length > 0) {
        const msgResult = await client.queryObjectStates({
          filter: {
            object_id: ids.join(","),
          },
        });

        return msgResult?.data
          .filter((obj) => obj?.decoded_value?.value)
          .map((obj) => {
            const value = obj?.decoded_value?.value as any;
            if (!value) return null;
            return {
              index: Number(value.index),
              channel_id: String(value.channel_id),
              sender: String(value.sender),
              content: String(value.content),
              timestamp: Number(value.timestamp),
              message_type: Number(value.message_type),
              mentions: Array.isArray(value.mentions)
                ? value.mentions.map(String)
                : [],
              reply_to: Number(value.reply_to),
              attachments: Array.isArray(value.attachments.value)
                ? value.attachments.value.map((att: any) => ({
                    attachment_type: Number(att[0]),
                    attachment_json: String(att[1]),
                  }))
                : [],
            } as Message;
          })
          .filter((msg): msg is Message => msg !== null);
      }
    },
    refetchInterval: 5000,
    enabled: !!input && input.size > 0,
  });

  return {
    messages: messages || [],
    isPending,
    isError,
    refetch,
  };
}
