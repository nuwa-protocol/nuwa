import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { AnnotatedMoveStructView, Args } from "@roochnetwork/rooch-sdk";
import { useNetworkVariable } from "./useNetworks";

export default function useAgentWithAddress(address?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: agent,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useAgentWithAddress", address],
    queryFn: async () => {
      if (!client || !packageId) {
        return null;
      }

      try {
        const result = await client.executeViewFunction({
          target: `${packageId}::agent::get_agent_info_by_address`,
          args: [Args.address(address!)],
        });

        if (result.return_values && result.return_values.length > 0) {
          const agentInfoValue = (
            result.return_values[0].decoded_value as AnnotatedMoveStructView
          ).value as any;

          // Safely extract values with type checking
          const extractValue = (value: any, defaultValue: string = "") => {
            if (!value) return defaultValue;
            return typeof value === "string" ? value : String(value);
          };

          const agentData = {
            id: extractValue(agentInfoValue.id),
            name: extractValue(agentInfoValue.name),
            username: extractValue(agentInfoValue.username),
            description: extractValue(agentInfoValue.description),
            address: extractValue(agentInfoValue.agent_address),
            instructions: extractValue(agentInfoValue.instructions),
            temperature: extractValue(agentInfoValue.temperature),
          };

          return agentData;
        }
        return null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!address && !!client && !!packageId,
    retry: false,
    staleTime: 0,
  });

  return {
    agent,
    isPending,
    isError,
    refetch,
  };
}
