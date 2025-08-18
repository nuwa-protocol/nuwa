import { useState } from "react";
import {
  InboxIcon,
  ClockIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useAgentProfile } from "./AgentProfileContext";
import { useAgentMemories } from "@/hooks/useAgentMemories";

export function AgentMemoriesPanel() {
  const { agent, currentAddress } = useAgentProfile();
  const [activeMemoryTab, setActiveMemoryTab] = useState<"all" | "user">("all");

  const {
    memories: allMemories,
    isLoading: isLoadingMemories,
    error: memoriesError,
    refetch: refetchMemories,
  } = useAgentMemories({
    agentId: agent?.id || "",
  });

  const {
    memories: userMemories,
    isLoading: isLoadingUserMemories,
    error: userMemoriesError,
    refetch: refetchUserMemories,
  } = useAgentMemories({
    agentId: agent?.id || "",
    targetAddress: currentAddress || undefined,
  });

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Agent Memory
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveMemoryTab("all")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeMemoryTab === "all"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Agent Self Memory
              </button>
              {currentAddress && (
                <button
                  onClick={() => setActiveMemoryTab("user")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeMemoryTab === "user"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  Agent Memories About You
                </button>
              )}
            </div>
          </div>
          <button
            onClick={
              activeMemoryTab === "all" ? refetchMemories : refetchUserMemories
            }
            className="flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <ArrowPathIcon className="mr-1.5 h-4 w-4" />
            Refresh
          </button>
        </div>

        {activeMemoryTab === "all" ? (
          isLoadingMemories ? (
            <div className="flex items-center justify-center py-8">
              <svg
                className="h-8 w-8 animate-spin text-purple-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
            </div>
          ) : memoriesError ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
                <svg
                  className="h-16 w-16 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
                Load failed
              </h3>
              <p className="mx-auto mb-4 max-w-sm text-sm text-red-500 dark:text-red-400">
                {memoriesError || "Load memory failed"}
              </p>
              <button
                onClick={refetchMemories}
                className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : allMemories.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <InboxIcon className="h-16 w-16 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
                No memories
              </h3>
              <p className="mx-auto max-w-sm text-sm text-gray-500 dark:text-gray-400">
                The agent has not created any memories yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {allMemories.map((memory, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center">
                        <span className="rounded bg-purple-50 px-2 py-1 text-xs font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                          Memories #{index + 1}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {memory.content}
                      </p>
                      {memory.context && (
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          {memory.context}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <ClockIcon className="mr-1 h-4 w-4" />
                      {new Date(memory.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : isLoadingUserMemories ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="h-8 w-8 animate-spin text-purple-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              ></path>
            </svg>
          </div>
        ) : userMemoriesError ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
              <svg
                className="h-16 w-16 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
              Load failed
            </h3>
            <p className="mx-auto mb-4 max-w-sm text-sm text-red-500 dark:text-red-400">
              {userMemoriesError || "Load memory failed"}
            </p>
            <button
              onClick={refetchUserMemories}
              className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : userMemories.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <InboxIcon className="h-16 w-16 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
              No memories about you
            </h3>
            <p className="mx-auto max-w-sm text-sm text-gray-500 dark:text-gray-400">
              The agent has not created any memories about you yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {userMemories.map((memory, index) => (
              <div
                key={index}
                className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center">
                      <span className="rounded bg-purple-50 px-2 py-1 text-xs font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                        Memory #{index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {memory.content}
                    </p>
                    {memory.context && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {memory.context}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <ClockIcon className="mr-1 h-4 w-4" />
                    {new Date(memory.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
