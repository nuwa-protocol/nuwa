import { useEffect, useState, useCallback } from 'react';
import {
  useCurrentWallet,
  useCurrentAddress,
  useConnectionStatus,
  useConnectWallet,
  useAutoConnectWallet,
} from '@roochnetwork/rooch-sdk-kit';
import { AuthStore, UserStore } from '../lib/storage';

export interface UseWalletAuthResult {
  canRestore: boolean;
  /**
   * Attempt to restore wallet session
   * @returns {Object} result
   * @returns {boolean} result.success - true if session restored successfully
   * @returns {boolean} result.isWaiting - true if waiting for wallet auto-connect (autoConnectStatus === 'idle' or wallet not yet connected)
   */
  restoreSession: () => Promise<{ success: boolean; isWaiting: boolean }>;
  error: string | null;
}

/**
 * Hook for wallet authentication and session restoration
 * Uses rooch-sdk-kit hooks directly to avoid timing issues
 */
export function useWalletAuth(): UseWalletAuthResult {
  const [error, setError] = useState<string | null>(null);
  const [shouldAttemptRestore, setShouldAttemptRestore] = useState(false);
  
  // Rooch SDK Kit hooks
  const currentWallet = useCurrentWallet();
  const currentAddress = useCurrentAddress();
  const connectionStatus = useConnectionStatus();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const autoConnectStatus = useAutoConnectWallet();

  // Monitor wallet state changes and attempt restore when conditions are met
  useEffect(() => {
    if (shouldAttemptRestore && connectionStatus === 'connected' && currentAddress) {
      console.log('[useWalletAuth] Wallet connected, attempting session restore...');
      setShouldAttemptRestore(false);
      
      // Delay the restore attempt slightly to ensure all state is synced
      setTimeout(async () => {
        const result = await restoreSession();
        console.log('[useWalletAuth] Auto-restore result:', result);
        // Note: No longer dispatching events - AuthContext handles state via structured returns
      }, 100);
    }
  }, [connectionStatus, currentAddress, shouldAttemptRestore]);

  // Check if we can restore a wallet session
  const canRestore = useCallback((): boolean => {
    const currentUserDid = AuthStore.getCurrentUserDid();
    if (!currentUserDid) return false;
    
    const authMethod = UserStore.getAuthMethod(currentUserDid);
    return authMethod === 'wallet';
  }, []);

  // Create User DID from Bitcoin address
  const createUserDidFromBitcoinAddress = useCallback((bitcoinAddress: string): string => {
    return `did:bitcoin:${bitcoinAddress}`;
  }, []);

  // Restore wallet session
  const restoreSession = useCallback(async (): Promise<{ success: boolean; isWaiting: boolean }> => {
    if (!canRestore()) {
      console.log('[useWalletAuth] No wallet session to restore');
      return { success: false, isWaiting: false };
    }

    console.log('[useWalletAuth] Attempting to restore wallet session...');
    console.log('[useWalletAuth] Current wallet state:', {
      hasWallet: !!currentWallet,
      hasAddress: !!currentAddress,
      connectionStatus,
      walletName: currentWallet?.getName?.(),
      autoConnectStatus,
    });

    // If auto-connect is still in progress, set flag to attempt restore later
    if (autoConnectStatus === 'idle') {
      console.log('[useWalletAuth] Auto-connect still in progress, will retry when wallet connects');
      setError(null);
      setShouldAttemptRestore(true);
      console.log('[useWalletAuth] Returning isWaiting=true');
      // Return isWaiting=true to indicate we're waiting for auto-connect
      return { success: false, isWaiting: true };
    }

    setError(null);

    try {

      // Check if wallet is connected
      if (connectionStatus !== 'connected' || !currentAddress) {
        console.log('[useWalletAuth] Wallet not connected, cannot restore session automatically');
        console.log('[useWalletAuth] Current wallet state:', {
          connectionStatus,
          hasAddress: !!currentAddress,
          hasWallet: !!currentWallet,
          walletName: currentWallet?.getName?.(),
        });
        
        // If auto-connect was attempted but wallet is still not connected, fail
        if (autoConnectStatus === 'attempted') {
          setError('Wallet not connected. Please reconnect your wallet.');
          return { success: false, isWaiting: false };
        }
        
        // Otherwise, set flag to attempt restore when wallet connects
        setShouldAttemptRestore(true);
        // Return isWaiting=true to indicate we're waiting for wallet to connect
        return { success: false, isWaiting: true };
      }

      // Verify the wallet address matches the stored user DID
      const currentUserDid = AuthStore.getCurrentUserDid();
      const bitcoinAddress = currentAddress.toStr();
      const expectedUserDid = createUserDidFromBitcoinAddress(bitcoinAddress);

      console.log('[useWalletAuth] Address verification:', {
        currentUserDid,
        expectedUserDid,
        bitcoinAddress,
        matches: expectedUserDid === currentUserDid,
      });

      if (expectedUserDid !== currentUserDid) {
        console.log('[useWalletAuth] Wallet address mismatch, cannot restore session');
        setError('Wallet address does not match stored session');
        return false;
      }

      // Wallet verified, session can be restored
      console.log('[useWalletAuth] Wallet verified, session can be restored');
      console.log('[useWalletAuth] Wallet session restored successfully');
      return { success: true, isWaiting: false };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useWalletAuth] Session restore failed:', error);
      setError(errorMessage);
      return { success: false, isWaiting: false };
    }
  }, [
    canRestore,
    currentWallet,
    currentAddress,
    connectionStatus,
    autoConnectStatus,
    connectWallet,
    createUserDidFromBitcoinAddress,
  ]);

  return {
    canRestore: canRestore(),
    restoreSession,
    error,
  };
}
