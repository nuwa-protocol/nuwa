import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseCreateAgentArgs = {
  name: string;
  username: string;
  avatar: string;
  description: string;
  instructions: string;
};

type UseCreateAgentResult = string;

type UseCreateAgentOptions = Omit<
  UseMutationOptions<UseCreateAgentResult, Error, UseCreateAgentArgs, unknown>,
  "mutationFn"
>;

export function useCreateAgent({
  mutationKey,
  ...mutationOptions
}: UseCreateAgentOptions = {}): UseMutationResult<
  UseCreateAgentResult,
  Error,
  UseCreateAgentArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.createAgent(mutationKey),
    mutationFn: async (args) => {
      const agentTx = new Transaction();
      agentTx.callFunction({
        target: `${packageId}::agent_entry::create_agent`,
        args: [
          Args.string(args.name),
          Args.string(args.username),
          Args.string(args.avatar),
          Args.string(args.description),
          Args.string(args.instructions),
        ],
      });

      agentTx.setMaxGas(5_00000000);

      const agentResult = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      if (agentResult.execution_info.status.type !== "executed") {
        console.error("Agent creation failed:", agentResult.execution_info);
        throw new Error(
          `Agent creation failed: ${JSON.stringify(
            agentResult.execution_info.status
          )}`
        );
      }

      // Find the Agent object from changeset
      const agentChange = agentResult.output?.changeset.changes.find((change) =>
        change.metadata.object_type.endsWith("::agent::Agent")
      );

      if (!agentChange?.metadata.id) {
        throw new Error("Failed to get agent ID from transaction result");
      }

      return agentChange!.metadata.id;
    },
    ...mutationOptions,
  });
}
