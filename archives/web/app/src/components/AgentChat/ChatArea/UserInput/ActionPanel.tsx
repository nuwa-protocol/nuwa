import { CurrencyDollarIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";

interface ActionPanelProps {
  onTransferClick: () => void;
  autoMentionAI: boolean;
  onAutoMentionToggle: () => void;
}

export function ActionPanel({
  onTransferClick,
  autoMentionAI,
  onAutoMentionToggle,
}: ActionPanelProps) {
  return (
    <div className="flex items-center space-x-2 p-1 mt-2 border-t border-gray-100 dark:border-gray-700">
      {/* transfer button */}
      <SessionKeyGuard onClick={onTransferClick}>
        <button className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
          <CurrencyDollarIcon className="w-5 h-5" />
          <span className="text-sm">Transfer RGAS</span>
        </button>
      </SessionKeyGuard>

      {/* auto @AI button */}
      <button
        onClick={onAutoMentionToggle}
        className={`flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
          autoMentionAI
            ? "text-purple-600 dark:text-purple-400"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        <SparklesIcon className="w-5 h-5" />
        <span className="text-sm">
          {autoMentionAI ? "Auto @AI" : "Manual @AI"}
        </span>
      </button>
    </div>
  );
}
