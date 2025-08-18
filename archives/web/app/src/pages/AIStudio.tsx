import { useNavigate } from "react-router-dom";
import {
  ChatBubbleLeftIcon,
  PencilIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import useAllAgents from "@/hooks/useAllAgents";
import useAgentCaps from "@/hooks/useAgentCaps";
import { useMemo } from "react";
import { SEO } from "../components/layout/SEO";
import {
  ConnectButton,
  SessionKeyGuard,
  useConnectionStatus,
} from "@roochnetwork/rooch-sdk-kit";

/**
 * AIStudio Component
 * Main page for managing AI agents, allowing users to create, view, and interact with their AI agents
 */
export const AIStudio = () => {
  const navigate = useNavigate();
  const connectStatus = useConnectionStatus();

  // Fetch all agents and their capabilities
  const { agents } = useAllAgents();
  const { caps } = useAgentCaps();

  // Filter agents based on user's capabilities
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => caps.has(agent.id));
  }, [agents, caps]);

  return (
    <>
      {/* SEO metadata for the page */}
      <SEO
        title="AI Studio"
        description="Nuwa AI Studio - Create, test, and deploy AI agents. A powerful platform for developing and experimenting with Web3 AI Agents on blockchain."
        keywords="AI Studio, Web3 AI Development, AI Agent Testing, Blockchain AI, Nuwa Development Platform"
      />
      <div className="min-h-screen px-4 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
          {/* Page header with title and new agent button */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                AI Studio
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Create, test, and manage your AI agents
              </p>
            </div>
            {connectStatus === "connected" && (
              <SessionKeyGuard onClick={() => navigate("/studio/create")}>
                <button className="flex items-center space-x-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700">
                  <PlusIcon className="h-5 w-5" />
                  <span>New Agent</span>
                </button>
              </SessionKeyGuard>
            )}
          </div>

          {/* Main content panel for displaying agents */}
          <div>
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
              {/* Wallet connection prompt */}
              {connectStatus !== "connected" ? (
                <div className="py-12 text-center">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                    <PlusIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
                    Connect Your Wallet
                  </h3>
                  <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                    Please connect your wallet to view and manage your AI agents
                  </p>
                  <ConnectButton className="!inline-flex !items-center !space-x-2 !rounded-lg !border-0 !bg-purple-600 !px-6 !py-3 !text-sm !font-medium !leading-5 !text-white !transition-colors !duration-200 hover:!bg-purple-700">
                    <PlusIcon className="h-5 w-5" />
                    <span>Connect Wallet</span>
                  </ConnectButton>
                </div>
              ) : filteredAgents.length === 0 ? (
                // Empty state when no agents are created
                <div className="py-12 text-center">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                    <PlusIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
                    No Agents Created Yet
                  </h3>
                  <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                    Start by creating your first AI Agent
                  </p>
                  <SessionKeyGuard onClick={() => navigate("/studio/create")}>
                    <button className="inline-flex items-center space-x-2 rounded-lg bg-purple-600 px-6 py-3 text-white hover:bg-purple-700">
                      <PlusIcon className="h-5 w-5" />
                      <span>Create New Agent</span>
                    </button>
                  </SessionKeyGuard>
                </div>
              ) : (
                // Grid of agent cards
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="relative flex min-h-[200px] flex-col rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      {/* Chat button for each agent */}
                      <button
                        onClick={() => navigate(`/agent/${agent.username}`)}
                        className="absolute right-3 top-3 flex items-center justify-center rounded-lg bg-gray-100 p-2 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                        title="Chat"
                      >
                        <ChatBubbleLeftIcon className="h-5 w-5" />
                      </button>
                      {/* Agent information display */}
                      <div className="mb-4 flex items-center space-x-4">
                        <img
                          src={
                            agent.avatar ||
                            "https://api.dicebear.com/7.x/bottts/svg?seed=task_helper"
                          }
                          alt={agent.name}
                          className="h-12 w-12 rounded-full bg-gray-100"
                        />
                        <div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {agent.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            @{agent.username}
                          </p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                      {/* Profile edit button */}
                      <div className="mt-auto flex items-center space-x-3">
                        <button
                          onClick={() => navigate(`/profile/${agent.address}`)}
                          className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                        >
                          <PencilIcon className="h-5 w-5" />
                          <span>Profile</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
