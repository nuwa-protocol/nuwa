import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseChannelCreateTopicArgs = {
  channelId: string;
  topic: string;
  joinPolicy: 0 | 1; // 0 public 1 private
};

type UseChannelCreateTopicResult = void;

type UseChannelCreateTopicOptions = Omit<
  UseMutationOptions<
    UseChannelCreateTopicResult,
    Error,
    UseChannelCreateTopicArgs,
    unknown
  >,
  "mutationFn"
>;

export function useChannelCreateTopic({
  mutationKey,
  ...mutationOptions
}: UseChannelCreateTopicOptions = {}): UseMutationResult<
  UseChannelCreateTopicResult,
  Error,
  UseChannelCreateTopicArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.joinChannel(mutationKey),
    mutationFn: async (args) => {
      const agentTx = new Transaction();
      agentTx.callFunction({
        target: `${packageId}::channel_entry::create_topic_channel`,
        args: [
          Args.objectId(args.channelId),
          Args.string(args.topic),
          Args.u8(args.joinPolicy),
        ],
      });

      const result = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error("Failed to join channel");
      }
    },
    ...mutationOptions,
  });
}
