import { useNetworkVariable } from "./useNetworks";
import { useCurrentAddress, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { AgentCapabilities } from "@/types/agent";

interface AgentCap {
  id: string;
  agentId: string;
  capabilities: AgentCapabilities;
}

interface UseAgentCapsResult {
  caps: Map<string, AgentCap>;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

export default function useAgentCaps(): UseAgentCapsResult {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");
  const address = useCurrentAddress();

  const {
    data: caps,
    isPending,
    isError,
    refetch,
  } = useQuery<Map<string, AgentCap>>({
    queryKey: ["useAgentCaps", address],
    queryFn: async () => {
      const agentCapsResponse = await client.queryObjectStates({
        filter: {
          object_type_with_owner: {
            object_type: `${packageId}::agent_cap::AgentCap`,
            owner: address!.toStr(),
          },
        },
      });

      return new Map(
        agentCapsResponse.data
          .filter((obj) => obj.decoded_value?.value?.agent_obj_id)
          .map((obj) => {
            const capabilities: AgentCapabilities = {
              canChat: true,
              canCreateChannels: Boolean(
                obj.decoded_value?.value?.can_create_channels || true
              ),
              canManageMembers: Boolean(
                obj.decoded_value?.value?.can_manage_members || true
              ),
              canSendMessages: Boolean(
                obj.decoded_value?.value?.can_send_messages || true
              ),
            };

            return [
              String(obj.decoded_value!.value.agent_obj_id),
              {
                id: obj.id,
                agentId: String(obj.decoded_value!.value.agent_obj_id),
                capabilities,
              },
            ];
          })
      );
    },
    enabled: !!address,
  });

  return {
    caps: caps ?? new Map(),
    isPending,
    isError,
    refetch,
  };
}
