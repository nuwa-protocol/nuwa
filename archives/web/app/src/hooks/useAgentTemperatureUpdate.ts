import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseUpdateAgentTemperatureArgs = {
  cap: string;
  temperature: number;
};

type UseUpdateAgentTemperatureResult = void;

type UseUpdateAgentTemperatureOptions = Omit<
  UseMutationOptions<
    UseUpdateAgentTemperatureResult,
    Error,
    UseUpdateAgentTemperatureArgs,
    unknown
  >,
  "mutationFn"
>;

// This hook is used to update the agent's temperature
export function useUpdateAgentTemperature({
  mutationKey,
  ...mutationOptions
}: UseUpdateAgentTemperatureOptions = {}): UseMutationResult<
  UseUpdateAgentTemperatureResult,
  Error,
  UseUpdateAgentTemperatureArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");

  return useMutation({
    mutationKey: mutationKeys.updateAgentTemperature(mutationKey),
    mutationFn: async (args) => {
      const agentTx = new Transaction();

      agentTx.callFunction({
        target: `${packageId}::agent::update_agent_temperature`,
        args: [Args.objectId(args.cap), Args.u64(BigInt(args.temperature))],
      });

      const result = await client.signAndExecuteTransaction({
        transaction: agentTx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error(
          `Agent temperature update failed: ${JSON.stringify(
            result.execution_info.status
          )}`
        );
      }
    },
    ...mutationOptions,
  });
}
