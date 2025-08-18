import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AgentCard } from "../components/AgentCard";
import { Hero } from "../components/home/Hero";
import { CreateAISection } from "../components/home/CreateAISection";
import { Footer } from "../components/home/Footer";
import useAllAgents from "@/hooks/useAllAgents";
import { SEO } from "../components/layout/SEO";

export const Home = () => {
  const { agents, isPending } = useAllAgents();

  const trendingAgents = useMemo(
    () => agents.filter((agent) => agent.isTrending),
    [agents],
  );
  const featuredAgents = useMemo(
    () => agents.filter((agent) => agent.isFeatured),
    [agents],
  );

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Home"
        description="Nuwa - The Web3 AI Agent Platform. Experience the future of autonomous AI agents on blockchain, managing crypto assets and executing on-chain operations."
        keywords="AI, Web3, Agent, Crypto, Nuwa, Blockchain, Autonomous AI, DeFi, Smart Contracts, AI Platform"
      />
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Hero />
          <div className="container mx-auto px-4 py-8">
            <div className="mb-12">
              <div className="mb-2 flex items-end justify-between md:mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white md:text-4xl">
                  Explore Agents
                </h2>
                <Link
                  // cSpell:ignore allagents
                  to="/allagents"
                  className="mx-4 mb-1 text-sm text-purple-600 transition-colors hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                >
                  View All Agents
                </Link>
              </div>

              {/* Trending Agents */}
              <div className="mb-12">
                <h3 className="mb-4 text-base font-semibold text-gray-600 dark:text-gray-400 md:text-xl">
                  Trending Agents
                </h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-4">
                  {trendingAgents.slice(0, 4).map((agent) => (
                    <AgentCard key={agent.agent_address} agent={agent} />
                  ))}
                </div>
              </div>

              {/* Featured Agents */}
              <div className="mb-12">
                <h3 className="mb-4 text-xl font-semibold text-gray-600 dark:text-gray-400">
                  Featured Agents
                </h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-4">
                  {featuredAgents.slice(0, 4).map((agent) => (
                    <AgentCard key={agent.agent_address} agent={agent} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Create AI Section */}
          <CreateAISection />
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
};
