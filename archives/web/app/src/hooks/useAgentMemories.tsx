import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { Args } from "@roochnetwork/rooch-sdk";
import { Memory } from "@/types/agent";
import { useNetworkVariable } from "./useNetworks";
import { useQuery } from "@tanstack/react-query";

interface UseAgentMemoriesProps {
  agentId: string;
  targetAddress?: string;
}

interface UseAgentMemoriesResult {
  memories: Memory[];
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentMemories({
  agentId,
  targetAddress,
}: UseAgentMemoriesProps): UseAgentMemoriesResult {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");

  const deserializeMemories = (response: any): Memory[] => {
    if (!response?.return_values?.[0]?.decoded_value?.value) {
      return [];
    }

    try {
      const memories = response.return_values[0].decoded_value.value;
      return memories.map((memory: any[]) => ({
        index: parseInt(memory[0]) || 0,
        content: memory[1] || "",
        context: "", // because the context field is not available in the return data, set it to an empty string
        timestamp: parseInt(memory[2]) || Date.now(),
      }));
    } catch (error) {
      console.error("Error deserializing memories:", error);
      return [];
    }
  };

  const {
    data: memories = [],
    isPending: isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["useAgentMemories", agentId, targetAddress],
    queryFn: async () => {
      if (!client || !packageId || !agentId) {
        return [];
      }

      let targetFunction: string;
      let args: any[];

      if (targetAddress) {
        targetFunction = `${packageId}::agent::get_agent_memories_about_user`;
        args = [Args.objectId(agentId), Args.address(targetAddress)];
      } else {
        targetFunction = `${packageId}::agent::get_agent_self_memories`;
        args = [Args.objectId(agentId)];
      }

      const response = await client.executeViewFunction({
        target: targetFunction,
        args: args,
      });

      return deserializeMemories(response);
    },
    enabled: !!client && !!packageId && !!agentId,
  });

  return {
    memories,
    isLoading,
    isError,
    error: error?.message || null,
    refetch,
  };
}
