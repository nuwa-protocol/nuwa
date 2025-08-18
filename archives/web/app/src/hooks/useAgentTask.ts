import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "./useNetworks";
import { Args } from "@roochnetwork/rooch-sdk";
import { TaskSpecification } from "@/types/task-types";

export default function useAgentTask(id?: string) {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const {
    data: agentTask,
    isPending,
    isError,
    refetch,
  } = useQuery<TaskSpecification[]>({
    queryKey: ["useAgentTask", id],
    queryFn: async () => {
      const result = await client.executeViewFunction({
        target: `${packageId}::agent::get_agent_task_specs_json`,
        args: [Args.objectId(id!)],
      });

      const json_str = String(result?.return_values?.[0]?.decoded_value ?? "");
      const specs = JSON.parse(json_str)?.task_specs;

      return specs as TaskSpecification[];
    },
    enabled: !!id,
  });

  return {
    agentTask: agentTask,
    isPending,
    isError,
    refetch,
  };
}
