import useRgasBalance from "@/hooks/useRgasBalance";
import useUserInfo from "@/hooks/useUserInfo";
import { useUserInit } from "@/hooks/useUserInit";
import { useUserUpdate } from "@/hooks/useUserUpdate";
import { ClipboardIcon, PencilIcon } from "@heroicons/react/24/outline";
import {
  SessionKeyGuard,
  useCurrentAddress,
} from "@roochnetwork/rooch-sdk-kit";
import { useState } from "react";
import { toast } from "react-toastify";
import { EditProfileModal } from "@/components/profile/EditUserProfileModal";
import { formatAmountDisplay } from "@/utils/amount";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { shortenAddress } from "@/utils/address";

const roochScanBaseUrl = "https://test.roochscan.io";

interface ProfilePanelProps {
  address: string;
}

export const UserProfilePanel = ({ address }: ProfilePanelProps) => {
  const isMdScreen = useBreakpoint("md");
  const currentAddress = useCurrentAddress();
  const isOwnProfile =
    currentAddress?.genRoochAddress().toBech32Address() === address;
  const {
    balance: rGas,
    isPending: isRgasPending,
    isError: isRgasError,
  } = useRgasBalance(address);
  const {
    userInfo,
    isPending: isUserInfoPending,
    isError: isUserInfoError,
    refetch: refetchUserInfo,
  } = useUserInfo(address);
  const { isPending: isUpdating } = useUserUpdate();
  const { isPending: isInitializing } = useUserInit();
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Address copied to clipboard!", {
      autoClose: 2000,
    });
  };

  if (isRgasPending || isUserInfoPending) {
    return <div>Loading...</div>;
  }

  if (isRgasError || isUserInfoError || !userInfo) {
    return <div>Error loading user profile</div>;
  }

  const handlerRefreshUserInfo = async () => {
    const s = setTimeout(async () => {
      await refetchUserInfo();
      clearTimeout(s);
    }, 1000);
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        {/* Cover Image */}
        <div className="h-32 bg-gradient-to-r from-purple-600 to-pink-600"></div>

        {/* Profile Info */}
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="group relative -mt-16 mb-4 h-32 w-32">
            <div className="relative h-full w-full overflow-hidden rounded-full">
              <img
                src={userInfo.avatar}
                alt={userInfo.name}
                className="h-full w-full rounded-full border-0 border-white bg-white object-cover dark:border-gray-800 dark:bg-gray-800"
              />
            </div>
          </div>

          {/* Name and Username */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {userInfo.name || "Name Not Set"}
                </h1>
              </div>
              {isOwnProfile && (
                <SessionKeyGuard
                  onClick={() => setIsEditProfileModalOpen(true)}
                >
                  <button
                    className="inline-flex items-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                    title="Edit Profile"
                  >
                    <PencilIcon className="mr-2 h-4 w-4" />
                    Edit Profile
                  </button>
                </SessionKeyGuard>
              )}
            </div>
            <div className="mt-1 flex flex-col space-y-2">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                @<span>{userInfo.username || "Username Not Set"}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                      {isMdScreen ? address : shortenAddress(address)}
                    </span>
                    <button
                      onClick={() => handleCopy(address?.toString() || "")}
                      className="w-fit text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Copy Address"
                    >
                      <ClipboardIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <a
                    href={`${roochScanBaseUrl}/account/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 cursor-pointer text-xs text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
                  >
                    <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-700">
                      View on Explorer
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* RGAS Balance */}
            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                RGAS Balance
              </h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatAmountDisplay(rGas ?? 0)} RGAS
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        initialData={{
          name: userInfo.name || "",
          username: userInfo.username || "",
          avatar: userInfo.avatar || "",
          id: userInfo.id,
        }}
        hasUsername={!!userInfo.username}
        isSubmitting={isUpdating || isInitializing}
        onSuccess={() => {
          handlerRefreshUserInfo();
        }}
      />
    </>
  );
};
