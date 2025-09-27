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
  
  // Track if we've seen a connected state to distinguish between initial load and actual disconnection
  const [hasBeenConnected, setHasBeenConnected] = useState(false);

  console.log('[WalletStoreConnector] Wallet state:', {
    hasWallet: !!currentWallet,
    hasAddress: !!currentAddress,
    connectionStatus,
    walletName: currentWallet?.getName?.(),
  });

  useEffect(() => {
    console.log('[WalletStoreConnector] useEffect triggered with wallet state:', {
      hasWallet: !!currentWallet,
      hasAddress: !!currentAddress,
      connectionStatus,
    });

    // Create wallet store access object
    const walletStoreAccess = {
      getCurrentWallet: () => currentWallet,
      getCurrentAddress: () => currentAddress,
      getConnectionStatus: () => connectionStatus,
    };

    // Get the wallet provider and inject the store access (with retry for robustness)
    const injectWalletStoreAccess = () => {
      authProviderRegistry
        .get('wallet')
        .then(provider => {
          if (provider instanceof WalletAuthProvider) {
            provider.setWalletStoreAccess(walletStoreAccess);
            console.log('[WalletStoreConnector] Successfully injected wallet store access');
          } else {
            console.warn('[WalletStoreConnector] Provider is not WalletAuthProvider:', provider);
          }
        })
        .catch(error => {
          console.warn('[WalletStoreConnector] Failed to get wallet provider, retrying...:', error);
          // Single retry after a short delay to handle timing issues
          setTimeout(() => {
            authProviderRegistry
              .get('wallet')
              .then(provider => {
                if (provider instanceof WalletAuthProvider) {
                  provider.setWalletStoreAccess(walletStoreAccess);
                  console.log('[WalletStoreConnector] Successfully injected wallet store access (retry)');
                }
              })
              .catch(retryError => {
                console.error('[WalletStoreConnector] Failed to get wallet provider after retry:', retryError);
              });
          }, 100);
        });
    };

    injectWalletStoreAccess();

    // Also inject wallet instance into WalletAgentService
    const walletAgentService = unifiedAgentService.getAgentServiceByMethod('wallet');
    if (walletAgentService instanceof WalletAgentService && currentWallet?.wallet) {
      walletAgentService.setCurrentWallet(currentWallet.wallet);
    }
  }, [currentWallet, currentAddress, connectionStatus]);

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
    if (isAuthenticated && authMethod === 'wallet' && connectionStatus === 'disconnected' && hasBeenConnected) {
      console.log('[WalletStoreConnector] Wallet disconnected after being connected, signing out user');
      signOut();
    }
  }, [connectionStatus, isAuthenticated, authMethod, signOut, hasBeenConnected]);

  // This component doesn't render anything
  return null;
}
