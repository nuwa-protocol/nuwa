import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  useCurrentWallet,
  useCurrentAddress,
  useWallets,
  useConnectWallet,
} from '@roochnetwork/rooch-sdk-kit';

interface WalletLoginProps {
  onSuccess?: (userDid: string, isNew: boolean) => void;
  onError?: (error: string) => void;
}

export function WalletLogin({ onSuccess, onError }: WalletLoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithProvider } = useAuth();

  // Rooch SDK Kit hooks
  const currentWallet = useCurrentWallet();
  const currentAddress = useCurrentAddress();
  const wallets = useWallets();
  const { mutateAsync: connectWallet } = useConnectWallet();

  // Handle wallet connection state changes
  useEffect(() => {
    if (currentWallet?.isConnected && currentAddress) {
      handleWalletConnected();
    }
  }, [currentWallet?.isConnected, currentAddress]);

  const handleWalletConnected = async () => {
    if (!currentAddress) {
      onError?.('No wallet address found');
      return;
    }

    try {
      setIsLoading(true);

      // Use the new loginWithProvider method
      const result = await loginWithProvider('wallet');

      onSuccess?.(result.userDid, result.isNewUser);
    } catch (error) {
      console.error('Wallet authentication failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Wallet authentication failed';
      onError?.(errorMessage);

      // Note: No disconnect method available in current SDK version
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    if (currentWallet?.isConnected) {
      // Already connected, proceed with authentication
      await handleWalletConnected();
      return;
    }

    try {
      setIsLoading(true);

      // Get available wallets - check installation status
      console.log(
        '[WalletLogin] All wallets:',
        wallets.map(w => ({ name: w.getName() }))
      );

      // Check which wallets are installed
      const walletInstallationChecks = await Promise.all(
        wallets.map(async wallet => ({
          wallet,
          isInstalled: await wallet.checkInstalled(),
        }))
      );

      const availableWallets = walletInstallationChecks
        .filter(({ isInstalled }) => isInstalled)
        .map(({ wallet }) => wallet);

      console.log(
        '[WalletLogin] Available wallets:',
        availableWallets.map(w => w.getName())
      );

      if (availableWallets.length === 0) {
        // In development, show more helpful error message
        const isDev = import.meta.env.DEV;
        const walletStatusList = walletInstallationChecks
          .map(
            ({ wallet, isInstalled }) =>
              `${wallet.getName()}(${isInstalled ? 'installed' : 'not installed'})`
          )
          .join(', ');

        const errorMessage = isDev
          ? `No Bitcoin wallets found. Available wallets: ${walletStatusList}. For development, you can install UniSat or OKX wallet, or we can add a mock wallet.`
          : 'No Bitcoin wallets found. Please install UniSat or OKX wallet.';
        onError?.(errorMessage);
        return;
      }

      // Connect to the first available wallet
      // In a real implementation, you might want to show a wallet selection dialog
      const walletToConnect = availableWallets[0];

      await connectWallet({ wallet: walletToConnect });

      // The useEffect will handle the rest when connection is established
    } catch (error) {
      console.error('Wallet connection failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Wallet connection failed';
      onError?.(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="w-full flex justify-center items-center py-2 px-4 border border-orange-300 rounded-md shadow-sm text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleConnectWallet}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-3 h-4 w-4 text-orange-700"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Connecting...
          </>
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 114 0 2 2 0 01-4 0zm6 0a2 2 0 114 0 2 2 0 01-4 0z"
                clipRule="evenodd"
              />
            </svg>
            Connect Wallet
          </>
        )}
      </button>
    </div>
  );
}
