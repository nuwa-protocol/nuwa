import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";
import { TaskSpecification } from "@/types/task-types";

type UseUpdateAgentTaskArgs = {
  cap: string;
  taskSpecs: TaskSpecification[];
};

type UseUpdateAgentTaskResult = void;

type UseUpdateAgentTaskOptions = Omit<
  UseMutationOptions<
    UseUpdateAgentTaskResult,
    Error,
    UseUpdateAgentTaskArgs,
    unknown
  >,
  "mutationFn"
>;

// This hook is used to update the agent's information
// Only one value can be updated at a time
export function useUpdateAgentTaskTask({
  mutationKey,
  ...mutationOptions
}: UseUpdateAgentTaskOptions = {}): UseMutationResult<
  UseUpdateAgentTaskResult,
  Error,
  UseUpdateAgentTaskArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.updateAgent(mutationKey),
    mutationFn: async (args) => {
      const moveFormatSpecs = {
        task_specs: args.taskSpecs.map((spec) => ({
          name: spec.name,
          description: spec.description,
          arguments: spec.arguments.map((arg) => ({
            name: arg.name,
            type_desc: arg.type_desc,
            description: arg.description,
            required: arg.required,
          })),
          resolver: spec.resolver,
          on_chain: spec.on_chain,
          price: spec.price,
        })),
      };

      const tx = new Transaction();
      tx.callFunction({
        target: `${packageId}::agent::update_agent_task_specs_entry`,
        args: [
          Args.objectId(args.cap),
          Args.string(JSON.stringify(moveFormatSpecs)),
        ],
      });

      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error(
          "Failed to update task specifications" +
            JSON.stringify(result.execution_info)
        );
      }
    },
    ...mutationOptions,
  });
}
