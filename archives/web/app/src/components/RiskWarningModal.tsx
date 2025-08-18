import { useLocalStorageState } from "ahooks";
import { useState } from "react";
import { createPortal } from "react-dom";

interface RiskWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RiskWarningModal({ isOpen, onClose }: RiskWarningModalProps) {
  const [isChecked, setIsChecked] = useState(true);
  const [, setHasSeenRiskWarning] = useLocalStorageState<boolean | undefined>(
    "nuwa-hasSeenRiskWarning",
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-[500px] max-w-[90vw] rounded-lg bg-white p-6 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Alpha Test Warning
        </h2>
        <div className="space-y-4 text-gray-600 dark:text-gray-300">
          <p>
            1. The platform is currently in beta testing phase. We welcome you
            to test the features and submit test reports
          </p>
          <p>
            2. All chat messages are on-chain transactions and publicly visible.
            Please be kind in your interactions
          </p>
          <p>3. Users need to obtain testnet RGAS before using any features</p>
        </div>
        <div className="mt-6 flex items-center">
          <input
            type="checkbox"
            id="understand"
            checked={isChecked}
            onChange={(e) => setIsChecked(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <label
            htmlFor="understand"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            I understand
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              setHasSeenRiskWarning(true);
              onClose();
            }}
            disabled={!isChecked}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
