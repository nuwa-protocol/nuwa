import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { RoochAddress } from "@roochnetwork/rooch-sdk";
import { Agent } from "../types/agent";
import { FEATURED_AGENTS } from "../config/featured-agents";
import { TRENDING_AGENTS } from "../config/featured-agents";

interface UseAgentResult {
  agent: Agent | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

export default function useAgent(id?: string): UseAgentResult {
  const client = useRoochClient()

  const {
    data: agent,
    isPending,
    isError,
    refetch,
  } = useQuery<Agent | undefined>({
    queryKey: ['useAgent', id],
    queryFn: async () => {
      const agentsResponse = await client.queryObjectStates({
        filter: {
          object_id: id!,
        },
      })

      const agents = agentsResponse.data.map(obj => {
        const agentObj = agentsResponse.data[0];
        const agentData = obj.decoded_value?.value || {};
        const agentAddress = agentData.agent_address ?
          new RoochAddress(String(agentData.agent_address)).toBech32Address() : '';
        const username = String(agentData.username || 'unnamed');

        return {
          id: obj.id,
          address: agentAddress,
          username: username,
          name: String(agentData.name || 'Unnamed Agent'),
          avatar: String(agentData.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + agentData.username),
          description: String(agentData.description || 'No description available'),
          lastActive: new Date(Number(agentData.last_active_timestamp) || Date.now()).toISOString(),
          createdAt: new Date(Number(agentData.created_at) || Date.now()).toISOString(),
          modelProvider: "GPT-4",
          agent_address: agentAddress,
          prompt: String(agentData.prompt || ''),
          isFeatured: FEATURED_AGENTS.includes(username as any),
          isTrending: TRENDING_AGENTS.includes(username as any),
          instructions: String(agentData.instructions || ''),
        } as Agent;
      })

      return agents[0]
    },
    enabled: !!id
  })

  return {
    agent, isPending, isError, refetch
  }
}