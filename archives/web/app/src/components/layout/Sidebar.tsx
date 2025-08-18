import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import useAllAgents from "@/hooks/useAllAgents";
import useAgentJoined from "@/hooks/useAgentJoined";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import clsx from "clsx";

interface SidebarProps {
  onCollapse: (isCollapsed: boolean) => void;
  isCollapsed?: boolean;
}

export function Sidebar({
  onCollapse,
  isCollapsed: propIsCollapsed,
}: SidebarProps) {
  const [localIsCollapsed, setLocalIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const { joinedAgents } = useAgentJoined();
  const { agents: allAgents } = useAllAgents();

  // Get current agent ID from URL
  const currentAgentUsername = location.pathname.split("/agent/")[1];

  // Filter agents based on search query
  const filteredAgents = useMemo(() => {
    // If search query is empty, only show joined agents
    if (!searchQuery.trim()) return joinedAgents || [];

    // If there's a search query, search through all agents
    const query = searchQuery.toLowerCase().trim();
    return (allAgents || []).filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.username.toLowerCase().includes(query),
    );
  }, [joinedAgents, allAgents, searchQuery]);

  // Use prop value or local state
  const isCollapsed = propIsCollapsed ?? localIsCollapsed;

  // Use unified mock data
  // const agentNames = mockAgents

  const handleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setLocalIsCollapsed(newCollapsedState);
    onCollapse(newCollapsedState);
  };

  const isMdScreen = useBreakpoint("md");

  return (
    <div
      className={clsx(
        "fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16 bg-gray-50" : "w-64 bg-gray-50",
        isMdScreen || !isCollapsed
          ? "border-gray-200 dark:border-gray-800 dark:bg-gray-900"
          : "bg-transparent",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header with Collapse Button and Search */}
        <div
          className={clsx("px-2 py-2", {
            "px-0": isCollapsed && !isMdScreen,
          })}
        >
          <div
            className={`flex items-center ${
              isCollapsed ? "justify-center" : "space-x-2"
            }`}
          >
            <div
              className={`relative flex-1 transition-all duration-300 ease-in-out ${
                isCollapsed ? "hidden" : "w-auto"
              }`}
            >
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transform rounded-full p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <XMarkIcon className="h-4 w-4 text-gray-400" />
                </button>
              )}
            </div>
            <button
              onClick={handleCollapse}
              className={clsx(
                "rounded-lg bg-gray-50 p-2 text-gray-600 transition-colors duration-200 hover:bg-gray-100 focus:outline-none focus:ring-0 focus:ring-offset-0 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                {
                  "relative -left-3 opacity-80 shadow-lg dark:bg-gray-500":
                    isCollapsed && !isMdScreen,
                },
              )}
            >
              <div className="relative h-5 w-5">
                <svg
                  className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                    isCollapsed
                      ? "rotate-0 opacity-100"
                      : "-rotate-180 opacity-0"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
                <svg
                  className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                    isCollapsed
                      ? "rotate-180 opacity-0"
                      : "rotate-0 opacity-100"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                </svg>
              </div>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {(isMdScreen || !isCollapsed) && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Expanded State Content */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                isCollapsed
                  ? "h-0 overflow-hidden opacity-0"
                  : "h-auto opacity-100"
              }`}
            >
              <div className="px-4 pt-2">
                <div className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-2">
                  {filteredAgents.map((agent) => (
                    <div
                      key={agent.username}
                      className={`flex cursor-pointer items-start space-x-3 rounded-lg p-2 transition-colors ${
                        agent.username === currentAgentUsername
                          ? "bg-purple-200 dark:bg-purple-500/50"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                      onClick={() => navigate(`/agent/${agent.username}`)}
                    >
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className="aspect-square h-10 min-h-[40px] w-10 min-w-[40px] flex-shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {agent.name}
                        </h3>
                        <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          @{agent.username}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Collapsed State Avatars */}
            <div
              className={`transition-all duration-300 ease-in-out ${
                isCollapsed
                  ? "h-auto opacity-100"
                  : "h-0 overflow-hidden opacity-0"
              }`}
            >
              <div className="space-y-3 px-2 py-2">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.username}
                    className={`flex cursor-pointer justify-center rounded-lg p-2 transition-colors ${
                      agent.username === currentAgentUsername
                        ? "bg-purple-200 dark:bg-purple-500/50"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => navigate(`/agent/${agent.username}`)}
                  >
                    <img
                      src={agent.avatar}
                      alt={agent.name}
                      className="aspect-square h-10 min-h-[40px] w-10 min-w-[40px] rounded-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
