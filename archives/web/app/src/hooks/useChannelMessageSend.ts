import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";
import { MessageSendParams } from "../types/message";

interface MessageSendWithPayment extends MessageSendParams {
  aiAddress: string;
  payment?: number;
}

type UseChannelMessageSendArgs = MessageSendWithPayment;

type UseChannelMessageSendResult = void;

type UseChannelMessageSendOptions = Omit<
  UseMutationOptions<
    UseChannelMessageSendResult,
    Error,
    UseChannelMessageSendArgs,
    unknown
  >,
  "mutationFn"
>;

export function useChannelMessageSend({
  mutationKey,
  ...mutationOptions
}: UseChannelMessageSendOptions = {}): UseMutationResult<
  UseChannelMessageSendResult,
  Error,
  UseChannelMessageSendArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.snedChannelMessage(mutationKey),
    mutationFn: async (args) => {
      const hasPayment = args.payment !== undefined && args.aiAddress;

      const mentions = args.mentions || [];
      const content = args.content.toLowerCase();
      let finalContent = args.content;
      if (content.startsWith("/ai") || content.startsWith("@ai")) {
        finalContent = args.content.substring(3).trim();
        mentions.push(args.aiAddress);
      }

      const tx = new Transaction();
      if (hasPayment) {
        tx.callFunction({
          target: `${packageId}::channel_entry::send_message_with_coin`,
          args: [
            Args.objectId(args.channelId),
            Args.string(args.content),
            Args.vec("address", mentions),
            Args.u64(args.replyTo ? BigInt(args.replyTo) : 0n),
            Args.address(args.aiAddress),
            Args.u256(BigInt(args.payment || 0)),
          ],
          typeArgs: ["0x3::gas_coin::RGas"],
        });
      } else {
        tx.callFunction({
          target: `${packageId}::channel_entry::send_message`,
          args: [
            Args.objectId(args.channelId),
            Args.string(finalContent),
            Args.vec("address", mentions),
            Args.u64(args.replyTo ? BigInt(args.replyTo) : 0n),
          ],
        });
      }

      tx.setMaxGas(5_00000000);

      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error("Failed to send message");
      }
    },
    ...mutationOptions,
  });
}
