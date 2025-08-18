import { ClipboardIcon } from "@heroicons/react/24/outline";
import { useAgentProfile } from "./AgentProfileContext";

const roochScanBaseUrl = "https://test.roochscan.io";

export function AgentOverviewPanel() {
  const { agent, handleCopy } = useAgentProfile();

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
      <div className="px-6 py-6">
        <h2 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Overview
        </h2>

        <div className="space-y-6">
          {/* Character Username */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              Username
            </h3>
            <div className="group flex items-center">
              <code className="flex-1 rounded bg-gray-50 p-2 font-mono text-sm text-gray-900 dark:bg-gray-800/50 dark:text-gray-100">
                {agent?.username}
              </code>
            </div>
          </div>

          {/* Agent ID */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              Agent ID
            </h3>
            <div className="group flex items-center">
              <code className="flex-1 break-all rounded bg-gray-50 p-2 font-mono text-sm text-gray-900 dark:bg-gray-800/50 dark:text-gray-100">
                {agent?.id}
              </code>
              <button
                onClick={() => handleCopy(agent?.id || "")}
                className="ml-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Copy to clipboard"
              >
                <ClipboardIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Agent Address */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
              Agent Address
            </h3>
            <div className="group flex items-center">
              <div className="flex flex-1 flex-col">
                <div className="flex items-center space-x-2">
                  <code className="break-all font-mono text-sm text-gray-900 dark:text-gray-100">
                    {agent?.agent_address}
                  </code>
                  <button
                    onClick={() => handleCopy(agent?.agent_address || "")}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Copy address"
                  >
                    <ClipboardIcon className="h-4 w-4" />
                  </button>
                </div>
                <a
                  href={`${roochScanBaseUrl}/account/${agent?.agent_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 cursor-pointer text-xs text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
                >
                  <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-700">
                    View in browser
                  </span>
                </a>
              </div>
            </div>
          </div>

          {/* Other Info Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Model Provider
              </h3>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {agent?.modelProvider}
              </p>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Last Active Time
              </h3>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {agent?.lastActive}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
