import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseChannelLeaveArgs = {
  id: string;
};

type UseChannelLeaveResult = void;

type UseChannelLeaveOptions = Omit<
  UseMutationOptions<
    UseChannelLeaveResult,
    Error,
    UseChannelLeaveArgs,
    unknown
  >,
  "mutationFn"
>;

export function useChannelLeave({
  mutationKey,
  ...mutationOptions
}: UseChannelLeaveOptions = {}): UseMutationResult<
  UseChannelLeaveResult,
  Error,
  UseChannelLeaveArgs,
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
        target: `${packageId}::channel_entry::leave_channel`,
        args: [Args.objectId(args.id)],
      });

      const result = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error("Failed to leave channel");
      }
    },
    ...mutationOptions,
  });
}
