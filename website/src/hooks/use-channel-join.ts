import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./use-networks";

type UseChannelJoinArgs = {
  address: string;
};

type UseChannelJoinResult = void;

type UseChannelJoinOptions = Omit<
  UseMutationOptions<UseChannelJoinResult, Error, UseChannelJoinArgs, unknown>,
  "mutationFn"
>;

export function useChannelJoin({
  mutationKey,
  ...mutationOptions
}: UseChannelJoinOptions = {}): UseMutationResult<
UseChannelJoinResult,
  Error,
  UseChannelJoinArgs,
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
        target: `${packageId}::channel::join_channel_entry`,
        args: [
          Args.string(args.address),
        ],
      });

      const result = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      if (result.execution_info.status.type !== 'executed') {
        throw new Error('Failed to join channel');
      }
    },
    ...mutationOptions,
  });
}
