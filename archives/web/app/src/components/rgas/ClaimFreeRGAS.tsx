import { useState } from "react";

type ClaimMethod = "newUser" | "twitter" | "invite";

export const ClaimFreeRGAS = () => {
  const [claimStatus, setClaimStatus] = useState<
    Record<ClaimMethod, "available" | "pending" | "claimed">
  >({
    newUser: "available",
    twitter: "available",
    invite: "available",
  });

  const handleClaim = (method: ClaimMethod) => {
    if (claimStatus[method] !== "available") return;

    setClaimStatus((prev) => ({ ...prev, [method]: "pending" }));

    // Simulate API call
    setTimeout(() => {
      setClaimStatus((prev) => ({ ...prev, [method]: "claimed" }));
    }, 1500);
  };

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold dark:text-white">
        Get Free RGAS
      </h2>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        There are multiple ways to get RGAS tokens for free. Complete the
        following tasks to claim:
      </p>

      <div className="space-y-6">
        {/* New User Reward */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium dark:text-white">
                New User Reward
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                New registered users can claim 50 RGAS for free
              </p>
            </div>
            <button
              onClick={() => handleClaim("newUser")}
              disabled={claimStatus.newUser !== "available"}
              className={`rounded-md px-4 py-2 font-medium text-white ${
                claimStatus.newUser === "available"
                  ? "bg-blue-500 hover:bg-blue-600"
                  : claimStatus.newUser === "pending"
                    ? "cursor-wait bg-gray-400"
                    : "cursor-default bg-green-500"
              }`}
            >
              {claimStatus.newUser === "available"
                ? "Claim"
                : claimStatus.newUser === "pending"
                  ? "Processing..."
                  : "Claimed"}
            </button>
          </div>
        </div>

        {/* Connect Twitter */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium dark:text-white">
                Connect Twitter Account
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Connect your Twitter account to get 100 RGAS
              </p>
            </div>
            <button
              onClick={() => handleClaim("twitter")}
              disabled={claimStatus.twitter !== "available"}
              className={`rounded-md px-4 py-2 font-medium text-white ${
                claimStatus.twitter === "available"
                  ? "bg-blue-500 hover:bg-blue-600"
                  : claimStatus.twitter === "pending"
                    ? "cursor-wait bg-gray-400"
                    : "cursor-default bg-green-500"
              }`}
            >
              {claimStatus.twitter === "available"
                ? "Connect Twitter"
                : claimStatus.twitter === "pending"
                  ? "Processing..."
                  : "Claimed"}
            </button>
          </div>
        </div>

        {/* Invite Friends */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium dark:text-white">
                Invite Friends
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Earn 75 RGAS for each new user who registers with your referral
              </p>
            </div>
            <div className="flex space-x-3">
              <input
                type="text"
                readOnly
                value="https://nuwa.io/refer?code=YOUR_CODE"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              />
              <button className="rounded-md bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600">
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
