import { useCurrentAddress, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { RoochAddress, Serializer } from "@roochnetwork/rooch-sdk";
import { useNetworkVariable } from "./useNetworks";
import { Agent } from "@/types/agent";

export default function useAgentJoined() {
  const client = useRoochClient();
  const packageId = useNetworkVariable("packageId");
  const address = useCurrentAddress();

  const {
    data: joinedAgents,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["useAgentJoined"],
    queryFn: async () => {
      const userChannelStoreId = Serializer.accountNamedObjectID(
        address!.genRoochAddress().toHexAddress(),
        `${packageId}::user_joined_channels::UserChannelStore`
      );

      const result = await client.listFieldStates({
        objectId: userChannelStoreId,
      });

      const decode = result.data
        .map((item: any) => {
          const value = item.state.decoded_value?.value.value.value;

          return {
            activeAt: value.active_at,
            agentId: value.agent_id,
          };
        })
        .sort((a: any, b: any) => {
          return b.activeAt - a.activeAt;
        });

      const agentIds = new Set(decode.map((item: any) => item.agentId));
      try {
        const res = await client.queryObjectStates({
          filter: {
            object_id: Array.from(agentIds).join(","),
          },
        });

        return res.data.map((obj) => {
          const agentData = obj.decoded_value?.value || {};
          const agentAddress = agentData.agent_address
            ? new RoochAddress(
                String(agentData.agent_address)
              ).toBech32Address()
            : "";
          const username = String(agentData.username || "unnamed");
          return {
            id: obj.id,
            address: agentAddress,
            username,
            name: String(agentData.name || "Unnamed Agent"),
            avatar: String(
              agentData.avatar ||
                "https://api.dicebear.com/7.x/bottts/svg?seed=" +
                  agentData.username
            ),
            description: String(
              agentData.description || "No description available"
            ),
            lastActive: new Date(
              Number(agentData.last_active_timestamp) || Date.now()
            ).toISOString(),
            createdAt: new Date(
              Number(agentData.created_at) || Date.now()
            ).toISOString(),
            modelProvider: "GPT-4",
            agent_address: agentAddress,
            prompt: String(agentData.prompt || ""),
            isFeatured: false,
            isTrending: false,
            instructions: String(agentData.instructions || ""),
          } as Agent;
        });
      } catch (error) {
        console.log(error);
      }
      return [];
    },
    enabled: !!address,
  });

  return {
    joinedAgents: joinedAgents || [],
    isPending,
    isError,
    refetch,
  };
}
