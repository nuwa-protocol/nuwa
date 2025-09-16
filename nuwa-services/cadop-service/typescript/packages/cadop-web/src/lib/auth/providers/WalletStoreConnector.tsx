import { useEffect } from 'react';
import {
  useCurrentWallet,
  useCurrentAddress,
  useConnectionStatus,
} from '@roochnetwork/rooch-sdk-kit';
import { WalletAuthProvider } from './WalletAuthProvider';
import { authProviderRegistry } from './AuthProviderRegistry';
import { unifiedAgentService } from '../../agent/UnifiedAgentService';
import { WalletAgentService } from '../../agent/WalletAgentService';

/**
 * Component that connects the WalletAuthProvider to the wallet store
 * This must be rendered inside the WalletProvider context
 */
export function WalletStoreConnector() {
  // Get wallet store state using hooks
  const currentWallet = useCurrentWallet();
  const currentAddress = useCurrentAddress();
  const connectionStatus = useConnectionStatus();

  useEffect(() => {
    // Create wallet store access object
    const walletStoreAccess = {
      getCurrentWallet: () => currentWallet,
      getCurrentAddress: () => currentAddress,
      getConnectionStatus: () => connectionStatus,
    };

    // Get the wallet provider and inject the store access
    authProviderRegistry
      .get('wallet')
      .then(provider => {
        if (provider instanceof WalletAuthProvider) {
          provider.setWalletStoreAccess(walletStoreAccess);
          console.log('[WalletStoreConnector] Successfully injected wallet store access');
        }
      })
      .catch(error => {
        console.warn('[WalletStoreConnector] Failed to get wallet provider:', error);
      });

    // Also inject wallet instance into WalletAgentService
    const walletAgentService = unifiedAgentService.getAgentServiceByMethod('wallet');
    if (walletAgentService instanceof WalletAgentService && currentWallet?.wallet) {
      walletAgentService.setCurrentWallet(currentWallet.wallet);
    }
  }, [currentWallet, currentAddress, connectionStatus]);

  // This component doesn't render anything
  return null;
}
