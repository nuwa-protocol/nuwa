import useAllBalance from "@/hooks/useAllBalance";
import { useTransfer } from "@/hooks/useTransfer";
import { Token } from "@/types/user";
import { formatAmountDisplay } from "@/utils/amount";
import { normalizeCoinIconUrl } from "@/utils/icon";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  SessionKeyGuard,
  useCurrentAddress,
} from "@roochnetwork/rooch-sdk-kit";
import { useState } from "react";
import { toast } from "react-toastify";

interface PortfolioPanelProps {
  address: string;
}

export const UserPortfolioPanel = ({ address }: PortfolioPanelProps) => {
  const currentAddress = useCurrentAddress();
  const isOwnProfile =
    currentAddress?.genRoochAddress().toBech32Address() === address;
  const {
    balances,
    isPending: isBalancePending,
    isError: isBalanceError,
    refetchBalance: refetchAllBalance,
  } = useAllBalance(address);
  const { mutate: transfer, isPending: isTransferring } = useTransfer();
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    recipient: "",
    amount: "",
    coinType: "",
  });
  const [currentToken, setCurrentToken] = useState<{
    name: string;
    symbol: string;
  } | null>(null);

  const itemsPerPage = 5;
  const totalPages = balances ? Math.ceil(balances.length / itemsPerPage) : 0;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageTokens = balances?.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchAllBalance();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  const handleTransfer = async (token: Token) => {
    setTransferForm((prev) => ({
      ...prev,
      coinType: token.id,
    }));
    setCurrentToken({
      name: token.name,
      symbol: token.symbol,
    });
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = async () => {
    try {
      await transfer({
        recipient: transferForm.recipient,
        amount: BigInt(Number(transferForm.amount) * 100_000_000), // Convert to smallest unit
        coinType: { target: transferForm.coinType },
      });
      setIsTransferModalOpen(false);
      refetchAllBalance();
      toast.success("Transfer successful!", {
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Transfer failed:", error);
      toast.error("Transfer failed, please try again", {
        autoClose: 3000,
      });
    }
  };

  if (isBalancePending) {
    return <div>Loading...</div>;
  }

  if (isBalanceError) {
    return <div>Error loading portfolio</div>;
  }

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Portfolio
        </h2>
        <button
          className={`text-gray-500 transition-transform duration-1000 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ${
            isRefreshing ? "animate-spin" : ""
          }`}
          title="Refresh"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <ArrowPathIcon className="h-3 w-3 md:h-5 md:w-5" />
        </button>
      </div>
      <div className="space-y-4">
        {currentPageTokens && currentPageTokens.length > 0 ? (
          currentPageTokens.map((tokenBalance) => (
            <div
              key={tokenBalance.token.id}
              className="flex items-center justify-between rounded-lg bg-white shadow-sm dark:bg-gray-800"
            >
              <div className="flex items-center space-x-3">
                <img
                  src={
                    tokenBalance.token.logo
                      ? normalizeCoinIconUrl(tokenBalance.token.logo)
                      : `data:image/svg+xml;utf8,${encodeURIComponent(
                          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="1.5"/><path d="M15 8.5C14.315 7.81501 13.1087 7.33003 12 7.33003C9.42267 7.33003 7.33333 9.41937 7.33333 12C7.33333 14.5807 9.42267 16.67 12 16.67C13.1087 16.67 14.315 16.185 15 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13.3333 12H16.6667M16.6667 12L15.3333 10.5M16.6667 12L15.3333 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                        )}`
                  }
                  alt={tokenBalance.token.name}
                  className="h-8 w-8 rounded-full bg-gray-100 p-1.5 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
                />
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">
                    {tokenBalance.token.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
                    {tokenBalance.token.symbol}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 md:text-base">
                    {formatAmountDisplay(tokenBalance.balance)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
                    {tokenBalance.token.symbol}
                  </p>
                </div>
                {isOwnProfile && (
                  <SessionKeyGuard
                    onClick={() => handleTransfer(tokenBalance.token)}
                  >
                    <button
                      className="rounded-md border border-purple-600 px-3 py-1 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 hover:text-purple-700 dark:border-purple-400 dark:text-purple-400 dark:hover:bg-purple-900/20 dark:hover:text-purple-300"
                      disabled={isTransferring}
                    >
                      {isTransferring ? "Transferring..." : "Transfer"}
                    </button>
                  </SessionKeyGuard>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No Assets Available
            </p>
          </div>
        )}
      </div>
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className={`flex items-center rounded-md px-4 py-2 text-sm font-medium ${
              currentPage === 1
                ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                : "text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            }`}
          >
            <ChevronLeftIcon className="mr-1 h-5 w-5" />
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className={`flex items-center rounded-md px-4 py-2 text-sm font-medium ${
              currentPage === totalPages
                ? "cursor-not-allowed text-gray-400 dark:text-gray-500"
                : "text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            }`}
          >
            Next
            <ChevronRightIcon className="ml-1 h-5 w-5" />
          </button>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
              Transfer {currentToken?.symbol || ""}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={transferForm.recipient}
                  onChange={(e) =>
                    setTransferForm((prev) => ({
                      ...prev,
                      recipient: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Enter recipient address"
                  disabled={isTransferring}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Amount
                </label>
                <input
                  type="number"
                  value={transferForm.amount}
                  onChange={(e) =>
                    setTransferForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Enter amount"
                  disabled={isTransferring}
                />
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                  disabled={isTransferring}
                >
                  Cancel
                </button>
                <SessionKeyGuard onClick={handleTransferSubmit}>
                  <button
                    disabled={
                      isTransferring ||
                      !transferForm.recipient ||
                      !transferForm.amount
                    }
                    className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTransferring ? "Transferring..." : "Transfer"}
                  </button>
                </SessionKeyGuard>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
