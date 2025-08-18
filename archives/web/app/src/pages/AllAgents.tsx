import { AgentCard } from "@/components/AgentCard";
import { LoadingScreen } from "@/components/layout/LoadingScreen";
import { SEO } from "@/components/layout/SEO";
import useAllAgents from "@/hooks/useAllAgents";
import { IndexerStateIDView } from "@roochnetwork/rooch-sdk";
import { useMemo, useState } from "react";

export const AllAgents = () => {
  const [page, setPage] = useState(1);
  const [lastCursor, setLastCursor] = useState<IndexerStateIDView | undefined>(
    undefined,
  );
  const [allAgents, setAllAgents] = useState<any[]>([]);
  const { agents, isPending, isError, hasNext, cursor } = useAllAgents({
    limit: "8",
    cursor: page > 1 ? lastCursor : undefined,
  });

  useMemo(() => {
    if (agents.length > 0) {
      // Use Set to deduplicate based on agent_address
      const existingAddresses = new Set(
        allAgents.map((agent) => agent.agent_address),
      );
      const newAgents = agents.filter(
        (agent) => !existingAddresses.has(agent.agent_address),
      );
      setAllAgents((prev) => [...prev, ...newAgents]);
    }
  }, [agents]);

  const handleLoadMore = () => {
    if (cursor) {
      setLastCursor(cursor as IndexerStateIDView);
    }
    setPage((prev) => prev + 1);
  };

  if (isPending && page === 1) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingScreen />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl text-red-500">Error loading agents</div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="All Agents"
        description="Browse all AI agents on Nuwa platform. Discover and interact with autonomous AI agents that can manage crypto assets and execute on-chain operations."
        keywords="AI Agents, Web3 AI, Autonomous Agents, Crypto Agents, Blockchain AI, Nuwa Agents"
      />
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-12">
          <h1 className="mb-8 text-3xl font-bold">All Agents</h1>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {allAgents.map((ai) => (
              <AgentCard key={ai.agent_address} agent={ai} />
            ))}
          </div>
          {hasNext && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isPending}
                className="rounded-lg bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
