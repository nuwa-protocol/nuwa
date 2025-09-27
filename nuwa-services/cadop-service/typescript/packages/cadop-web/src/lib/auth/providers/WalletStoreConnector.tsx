import { useEffect, useState } from 'react';
import {
  useCurrentWallet,
  useCurrentAddress,
  useConnectionStatus,
} from '@roochnetwork/rooch-sdk-kit';
import { WalletAuthProvider } from './WalletAuthProvider';
import { authProviderRegistry } from './AuthProviderRegistry';
import { unifiedAgentService } from '../../agent/UnifiedAgentService';
import { WalletAgentService } from '../../agent/WalletAgentService';
import { useAuth } from '../AuthContext';

/**
 * Component that connects the WalletAuthProvider to the wallet store
 * This must be rendered inside the WalletProvider context
 */
export function WalletStoreConnector() {
  // Get wallet store state using hooks
  const currentWallet = useCurrentWallet();
  const currentAddress = useCurrentAddress();
  const connectionStatus = useConnectionStatus();
  const { signOut, authMethod, isAuthenticated } = useAuth();

  // Create a force disconnect function that triggers a page reload
  // This is the most reliable way to reset wallet state after clearing localStorage
  const forceDisconnect = () => {
    // Use a small delay to ensure localStorage is cleared first
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Track if we've seen a connected state to distinguish between initial load and actual disconnection
  const [hasBeenConnected, setHasBeenConnected] = useState(false);

  // Monitor wallet state for debugging if needed

  useEffect(() => {
    // Create wallet store access object
    const walletStoreAccess = {
      getCurrentWallet: () => currentWallet,
      getCurrentAddress: () => currentAddress,
      getConnectionStatus: () => connectionStatus,
      forceDisconnect,
    };

    // Get the wallet provider and inject the store access (with improved retry mechanism)
    const injectWalletStoreAccess = async (maxRetries = 10, delay = 50) => {
      // First check if wallet provider is registered to avoid unnecessary errors
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (!authProviderRegistry.isRegistered('wallet')) {
          // Provider not registered yet, wait and try again
          if (attempt === maxRetries) {
            return;
          }
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }

        try {
          const provider = await authProviderRegistry.get('wallet');
          if (provider instanceof WalletAuthProvider) {
            provider.setWalletStoreAccess(walletStoreAccess);
            return; // Success, exit the retry loop
          } else {
            console.warn('[WalletStoreConnector] Provider is not WalletAuthProvider:', provider);
            return; // Wrong type, no point in retrying
          }
        } catch (error) {
          if (attempt === maxRetries) {
            // Only log error on final attempt to reduce noise
            console.error(
              '[WalletStoreConnector] Failed to get wallet provider after all retries:',
              error
            );
          } else {
            // Wait before next attempt, with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
          }
        }
      }
    };

    injectWalletStoreAccess();

    // Also inject wallet instance into WalletAgentService
    const walletAgentService = unifiedAgentService.getAgentServiceByMethod('wallet');
    if (walletAgentService instanceof WalletAgentService && currentWallet?.wallet) {
      walletAgentService.setCurrentWallet(currentWallet.wallet);
    }
  }, [currentWallet, currentAddress, connectionStatus, forceDisconnect]);

  // Track when wallet becomes connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setHasBeenConnected(true);
    }
  }, [connectionStatus]);

  // Monitor wallet connection status and handle disconnection
  useEffect(() => {
    // Only sign out if:
    // 1. User is authenticated with wallet
    // 2. Wallet is currently disconnected
    // 3. We have previously seen a connected state (to avoid signing out during initial load)
    if (
      isAuthenticated &&
      authMethod === 'wallet' &&
      connectionStatus === 'disconnected' &&
      hasBeenConnected
    ) {
      console.log(
        '[WalletStoreConnector] Wallet disconnected after being connected, signing out user'
      );
      signOut();
    }
  }, [connectionStatus, isAuthenticated, authMethod, signOut, hasBeenConnected]);

  // This component doesn't render anything
  return null;
}
