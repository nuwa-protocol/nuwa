import useUserInfo from "@/hooks/useUserInfo";
import { UserInfo } from "@/types/user";
import { Menu, Transition } from "@headlessui/react";
import {
  ConnectButton,
  useConnectionStatus,
  useCurrentAddress,
  useSubscribeOnRequest,
} from "@roochnetwork/rooch-sdk-kit";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import useRgasBalance from "@/hooks/useRgasBalance";
import { formatAmountDisplay } from "@/utils/amount";

interface HeaderProps {
  isDarkMode: boolean;
}

export function Header({ isDarkMode }: HeaderProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const address = useCurrentAddress();
  const connectionStatus = useConnectionStatus();
  const { balance: rGas, refetchBalance } = useRgasBalance(
    address?.genRoochAddress().toHexAddress(),
  );
  const subscribeOnRequest = useSubscribeOnRequest();
  const { userInfo } = useUserInfo(address?.genRoochAddress().toHexAddress());
  const hasShownToast = useRef(false);
  const hasShownProfileToast = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeOnRequest((status) => {
      switch (status) {
        case "success":
          refetchBalance();
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [subscribeOnRequest, address, refetchBalance]);

  useEffect(() => {
    if (connectionStatus === "connected" && userInfo) {
      setUser({
        ...userInfo,
      });
    }
  }, [rGas, userInfo, connectionStatus, address]);

  // Show different toasts based on wallet connection and RGAS balance
  useEffect(() => {
    if (connectionStatus === "connected" && address && !hasShownToast.current) {
      hasShownToast.current = true;
      toast.success("Wallet Connected", {
        autoClose: 3000,
        position: "top-center",
        className: "mt-4",
      });
    }
  }, [connectionStatus, address]);

  // Show profile creation toast when user has RGAS but no username
  useEffect(() => {
    if (
      connectionStatus === "connected" &&
      address &&
      userInfo &&
      !userInfo?.name &&
      rGas &&
      rGas > 0 &&
      !hasShownProfileToast.current
    ) {
      hasShownProfileToast.current = true;
      toast(
        <div className="flex w-full flex-col gap-1 text-sm">
          <div className="font-bold">Create your profile</div>
          <Link
            to={`/profile/${address?.genRoochAddress().toBech32Address()}`}
            className="font-medium text-purple-500 hover:text-purple-600 dark:text-purple-200 dark:hover:text-purple-300"
          >
            Click here to set up your profile
          </Link>
        </div>,
        {
          autoClose: 5000,
          position: "top-center",
          className:
            "mt-4 bg-purple-50 border border-purple-200 text-purple-800 dark:bg-purple-900 dark:border-purple-800 dark:text-purple-300",
          icon: <span>👤</span>,
        },
      );
    }
  }, [connectionStatus, address, userInfo, rGas]);

  // Show RGAS toast when balance is 0
  useEffect(() => {
    if (
      connectionStatus === "connected" &&
      address &&
      rGas === 0 &&
      // cSpell:ignore getrgas
      window.location.pathname !== "/getrgas-testnet"
    ) {
      toast(
        <div className="flex w-full flex-col gap-1 text-sm">
          <div>No RGAS balance</div>
          <Link
            to="/getrgas-testnet"
            className="font-medium text-purple-500 hover:text-purple-600 dark:text-purple-200 dark:hover:text-purple-300"
          >
            Click here to get FREE RGAS
          </Link>
        </div>,
        {
          autoClose: 5000,
          position: "top-center",
          className:
            "mt-4 bg-purple-50 border border-purple-200 text-purple-800 dark:bg-purple-900 dark:border-purple-800 dark:text-purple-300",
          icon: <span>💜</span>,
        },
      );
    }
  }, [rGas, address]);

  const handleLogout = () => {
    setUser(null);
    const prefix = "rooch-sdk-kit";
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix)) {
        // because sdk will set the key to localStorage, so here can't use useLocalStorageState
        localStorage.removeItem(key);
      }
    });
    window.location.reload();
  };

  const formatAddress = (address: string | undefined) => {
    if (!address) return "";
    if (address.length <= 6) return address;
    return `${address.slice(0, 5)}...${address.slice(-3)}`;
  };

  return (
    <div className="fixed left-0 right-0 top-0 z-10 h-16 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex h-full items-center justify-between px-2 md:px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img
            src={
              isDarkMode
                ? "/nuwa-logo-horizontal-dark.svg"
                : "/nuwa-logo-horizontal.svg"
            }
            alt="Nuwa Logo"
            className="h-6 w-auto md:h-8"
          />
        </Link>

        {/* Right side content */}
        <div className="flex items-center space-x-4">
          <Link
            to="/docs/intro"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
          >
            Docs
          </Link>
          <div className="p-1">
            <ThemeToggle />
          </div>
          {connectionStatus !== "connected" ? (
            <ConnectButton className="px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:text-purple-700 dark:!text-white dark:hover:!bg-slate-400 dark:hover:text-purple-200">
              Connect Wallet
            </ConnectButton>
          ) : (
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center space-x-4 focus:outline-none">
                <img
                  src={user?.avatar}
                  alt={user?.name}
                  className="h-8 w-8 rounded-full"
                />
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.name ||
                      formatAddress(
                        address?.genRoochAddress().toBech32Address(),
                      )}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {formatAmountDisplay(rGas || 0)} RGAS
                  </span>
                </div>
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none dark:!bg-black/95 dark:ring-white/10">
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/studio"
                          className={`${
                            active
                              ? "!bg-gray-100 dark:!bg-purple-500/10 dark:!text-purple-400"
                              : "dark:!text-gray-300"
                          } block !bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:!bg-gray-100 dark:hover:!bg-purple-500/10 dark:hover:!text-purple-400`}
                        >
                          AI Studio
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to={`/profile/${address
                            ?.genRoochAddress()
                            .toBech32Address()}`}
                          className={`${
                            active
                              ? "!bg-gray-100 dark:!bg-purple-500/10 dark:!text-purple-400"
                              : "dark:!text-gray-300"
                          } block !bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:!bg-gray-100 dark:hover:!bg-purple-500/10 dark:hover:!text-purple-400`}
                        >
                          Profile
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          to="/getrgas-testnet"
                          className={`${
                            active
                              ? "!bg-gray-100 dark:!bg-purple-500/10 dark:!text-purple-400"
                              : "dark:!text-gray-300"
                          } block !bg-transparent px-4 py-2 text-sm text-gray-700 transition-colors hover:!bg-gray-100 dark:hover:!bg-purple-500/10 dark:hover:!text-purple-400`}
                        >
                          Get RGAS
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={`${
                            active
                              ? "!bg-gray-100 dark:!bg-purple-500/10 dark:!text-purple-400"
                              : "dark:!text-gray-300"
                          } block w-full !bg-transparent px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:!bg-gray-100 dark:hover:!bg-purple-500/10 dark:hover:!text-purple-400`}
                        >
                          Log Out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          )}
        </div>
      </div>
    </div>
  );
}
