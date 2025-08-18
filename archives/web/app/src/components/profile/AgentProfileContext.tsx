import useAgent from "@/hooks/useAgent";
import useAgentCaps from "@/hooks/useAgentCaps";
import useAgentTask from "@/hooks/useAgentTask";
import { useUpdateAgentTaskTask } from "@/hooks/useAgentTaskUpdate";
import { useUpdateAgent } from "@/hooks/useAgentUpdate";
import { useNetworkVariable } from "@/hooks/useNetworks";
import { TaskSpecification } from "@/types/task-types";
import { RoochAddress, Serializer } from "@roochnetwork/rooch-sdk";
import { useCurrentAddress } from "@roochnetwork/rooch-sdk-kit";
import { createContext, ReactNode, useContext } from "react";

interface AgentProfileContextType {
  agent: any;
  agentTask: TaskSpecification[] | undefined;
  isOwner: boolean;
  currentAddress: string | undefined;
  caps: Map<string, any>;
  refetchAgent: () => void;
  refetchAgentTask: () => void;
  updateAgent: (params: any) => Promise<any>;
  updateAgentTaskTask: (params: any) => Promise<any>;
  packageId: string;
  handleCopy: (text: string) => void;
}

interface AgentProfileProviderProps {
  children: ReactNode;
  address: string;
}

const AgentProfileContext = createContext<AgentProfileContextType | undefined>(
  undefined,
);

export const AgentProfileProvider = ({
  children,
  address,
}: AgentProfileProviderProps) => {
  const currentAddress = useCurrentAddress()?.genRoochAddress().toHexAddress();
  const packageId = useNetworkVariable("packageId");
  const agentId = Serializer.accountNamedObjectID(
    new RoochAddress(address).toHexAddress(),
    {
      address: packageId,
      module: "agent",
      name: "Agent",
    },
  );

  const { agent, refetch: refetchAgent } = useAgent(agentId);
  const { caps } = useAgentCaps();
  const { agentTask, refetch: refetchAgentTask } = useAgentTask(agent?.id);
  const { mutateAsync: updateAgent } = useUpdateAgent();
  const { mutateAsync: updateAgentTaskTask } = useUpdateAgentTaskTask();

  const isOwner = (agent?.id && caps.has(agent.id)) || false;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    // the success notification is implemented in the component
  };

  const value = {
    agent,
    agentTask,
    isOwner,
    currentAddress,
    caps,
    refetchAgent,
    refetchAgentTask,
    updateAgent,
    updateAgentTaskTask,
    packageId,
    handleCopy,
  };

  return (
    <AgentProfileContext.Provider value={value}>
      {children}
    </AgentProfileContext.Provider>
  );
};

export const useAgentProfile = () => {
  const context = useContext(AgentProfileContext);
  if (context === undefined) {
    throw new Error(
      "useAgentProfile must be used within a AgentProfileProvider",
    );
  }
  return context;
};
