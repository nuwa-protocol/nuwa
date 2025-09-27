import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useCurrentWallet,
  useCurrentAddress,
  useConnectionStatus,
  useConnectWallet,
  useAutoConnectWallet,
} from '@roochnetwork/rooch-sdk-kit';
import { AuthStore, UserStore } from '../lib/storage';

export interface UseWalletAuthResult {
  isRestoring: boolean;
  canRestore: boolean;
  restoreSession: () => Promise<{ success: boolean; isWaiting: boolean }>;
  error: string | null;
}

/**
 * Hook for wallet authentication and session restoration
 * Uses rooch-sdk-kit hooks directly to avoid timing issues
 */
export function useWalletAuth(): UseWalletAuthResult {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldAttemptRestore, setShouldAttemptRestore] = useState(false);
  
  // Use ref to track isRestoring synchronously
  const isRestoringRef = useRef(false);
  
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
        const success = await restoreSession();
        if (success) {
          // Trigger a re-authentication in AuthContext
          window.dispatchEvent(new CustomEvent('wallet-auth-success'));
        }
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
      console.log('[useWalletAuth] Setting isRestoring to true...');
      setIsRestoring(true);
      isRestoringRef.current = true; // Set ref synchronously
      setError(null);
      setShouldAttemptRestore(true);
      console.log('[useWalletAuth] Returning isWaiting=true');
      // Return isWaiting=true to indicate we're waiting for auto-connect
      return { success: false, isWaiting: true };
    }

    setIsRestoring(true);
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
          setIsRestoring(false);
          return { success: false, isWaiting: false };
        }
        
        // Otherwise, set flag to attempt restore when wallet connects
        setShouldAttemptRestore(true);
        setIsRestoring(true);
        isRestoringRef.current = true; // Set ref synchronously
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
      setIsRestoring(false);
      isRestoringRef.current = false;
      return { success: true, isWaiting: false };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useWalletAuth] Session restore failed:', error);
      setError(errorMessage);
      setIsRestoring(false);
      isRestoringRef.current = false;
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
    isRestoring: isRestoringRef.current, // Return the ref value for immediate access
    canRestore: canRestore(),
    restoreSession,
    error,
  };
}
