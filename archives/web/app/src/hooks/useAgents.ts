import { useNetworkVariable } from "./useNetworks";
import { useCurrentAddress, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { RoochAddress } from "@roochnetwork/rooch-sdk";

export default function useAgents() {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");
  const address = useCurrentAddress();

  const {
    data: agents,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useAgents", address],
    queryFn: async () => {
      const agentsResponse = await client.queryObjectStates({
        filter: {
          object_type_with_owner: {
            object_type: `${packageId}::agent::Agent`,
            owner: address!.toStr(),
          },
        },
      });

      return agentsResponse.data.map((obj) => {
        const agentData = obj.decoded_value?.value || {};
        const agentAddress = agentData.agent_address
          ? new RoochAddress(String(agentData.agent_address)).toBech32Address()
          : "";

        return {
          id: obj.id,
          name: String(agentData.name || "Unnamed Agent"),
          username: String(agentData.username || "unnamed"),
          description: String(
            agentData.description || "No description available"
          ),
          avatar: String(agentData.avatar || ""),
          agent_address: agentAddress,
        };
      });
    },
    enabled: !!address,
  });

  return {
    agents,
    isPending,
    isError,
    refetch,
  };
}
