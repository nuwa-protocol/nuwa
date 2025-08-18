import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { SEO } from "../components/layout/SEO";
import { AgentProfilePanel } from "../components/profile/AgentProfilePanel";
import { AgentProfileProvider } from "../components/profile/AgentProfileContext";
import { AgentTasksPanel } from "../components/profile/AgentTasksPanel";
import { AgentOverviewPanel } from "../components/profile/AgentOverviewPanel";
import { AgentPromptPanel } from "../components/profile/AgentPromptPanel";
import { AgentMemoriesPanel } from "../components/profile/AgentMemoriesPanel";
import { AgentTemperaturePanel } from "../components/profile/AgentTemperaturePanel";

interface AgentProfileProps {
  address: string;
}

export function AgentProfile({ address }: AgentProfileProps) {
  const navigate = useNavigate();

  return (
    <AgentProfileProvider address={address}>
      <SEO
        title="Agent Profile"
        description="View detailed information about this AI agent on Nuwa platform."
        keywords="AI Agent, Web3 AI, Autonomous Agent, Crypto Agent, Blockchain AI, Nuwa Agent"
        ogUrl={`https://nuwa.dev/agents/${address}`}
      />
      <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="mb-6 flex items-center text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          >
            <ArrowLeftIcon className="mr-2 h-5 w-5" />
            <span>Back</span>
          </button>

          {/* Profile Card */}
          <AgentProfilePanel />

          {/* Overview Section */}
          <AgentOverviewPanel />

          {/* Prompt Section */}
          <AgentPromptPanel />

          {/* Temperature Section */}
          <AgentTemperaturePanel />

          {/* Tasks Section */}
          <AgentTasksPanel />

          {/* Memories Section */}
          <AgentMemoriesPanel />
        </div>
      </div>
    </AgentProfileProvider>
  );
}
