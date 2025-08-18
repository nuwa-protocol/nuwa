import { Helmet } from "react-helmet-async";
import useRgasBalance from "@/hooks/useRgasBalance";
import { useState } from "react";
import { useCurrentAddress } from "@roochnetwork/rooch-sdk-kit";
import { toast } from "react-toastify";

const FAUCET_URL = "https://test-faucet.rooch.network";

export const GetRGASTestnet = () => {
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentAddress = useCurrentAddress()?.genRoochAddress().toHexAddress();
  const { refetchBalance } = useRgasBalance(currentAddress);

  const handleClaim = async () => {
    if (isClaiming || hasClaimed || !currentAddress) return;

    setIsClaiming(true);
    setError(null);

    try {
      const response = await fetch(`${FAUCET_URL}/faucet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claimer: currentAddress,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Claim failed");
      }

      const data = await response.json();
      await refetchBalance();
      setHasClaimed(true);
      toast.success(
        `Successfully claimed ${Math.floor(
          (data.gas || 5000000000) / 100000000,
        )} RGAS!`,
      );
    } catch (error) {
      console.error("Claim failed:", error);
      setError(error instanceof Error ? error.message : "Failed to claim RGAS");
      toast.error("Failed to claim RGAS");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Get RGAS - Nuwa</title>
      </Helmet>

      <h1 className="mb-6 text-center text-3xl font-bold dark:text-white">
        Get Testnet RGAS
      </h1>

      <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
        <div className="mb-6 text-center">
          <h2 className="mb-2 text-xl font-semibold dark:text-white">
            Testnet Faucet
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Get 50 RGAS tokens for free on the testnet for testing purposes
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <div className="flex flex-col items-center">
              <h3 className="mb-1 font-medium dark:text-white">Testnet RGAS</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                50 RGAS per claim
              </p>
            </div>
          </div>

          {error && (
            <div className="text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleClaim}
            disabled={isClaiming || hasClaimed || !currentAddress}
            className={`w-full rounded-lg px-4 py-3 font-medium text-white transition-colors ${
              !currentAddress
                ? "cursor-not-allowed bg-gray-400"
                : isClaiming
                  ? "cursor-wait bg-gray-400"
                  : hasClaimed
                    ? "cursor-default bg-green-500"
                    : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {!currentAddress
              ? "Connect Wallet"
              : isClaiming
                ? "Claiming..."
                : hasClaimed
                  ? "Claimed"
                  : "Claim 50 RGAS"}
          </button>

          {hasClaimed && (
            <div className="text-center text-sm text-green-600 dark:text-green-400">
              Claim successful! Please refresh the page to check your balance
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
