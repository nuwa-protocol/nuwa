import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseUpdateAgentArgs = {
  cap: string;
  name?: string;
  avatar?: string;
  description?: string;
  instructions?: string;
};

type UseUpdateAgentResult = void;

type UseUpdateAgentOptions = Omit<
  UseMutationOptions<UseUpdateAgentResult, Error, UseUpdateAgentArgs, unknown>,
  "mutationFn"
>;

// This hook is used to update the agent's information
// Only one value can be updated at a time
export function useUpdateAgent({
  mutationKey,
  ...mutationOptions
}: UseUpdateAgentOptions = {}): UseMutationResult<
  UseUpdateAgentResult,
  Error,
  UseUpdateAgentArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.updateAgent(mutationKey),
    mutationFn: async (args) => {
      const agentTx = new Transaction();

      if (args.name) {
        agentTx.callFunction({
          target: `${packageId}::agent::update_agent_name`,
          args: [Args.objectId(args.cap), Args.string(args.name)],
        });
      }

      if (args.avatar) {
        agentTx.callFunction({
          target: `${packageId}::agent::update_agent_avatar`,
          args: [Args.objectId(args.cap), Args.string(args.avatar)],
        });
      }

      if (args.description) {
        agentTx.callFunction({
          target: `${packageId}::agent::update_agent_description`,
          args: [Args.objectId(args.cap), Args.string(args.description)],
        });
      }

      if (args.instructions) {
        agentTx.callFunction({
          target: `${packageId}::agent::update_agent_instructions`,
          args: [Args.objectId(args.cap), Args.string(args.instructions)],
        });
      }

      const result = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      console.log(result);

      if (result.execution_info.status.type !== "executed") {
        throw new Error(
          `Agent update failed: ${JSON.stringify(result.execution_info.status)}`
        );
      }
    },
    ...mutationOptions,
  });
}
