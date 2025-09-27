import { AuthProvider, AuthResult, LoginOptions } from './types';
import { AuthMethod } from '../../storage/types';
import { AuthStore, UserStore } from '../../storage';
import { ThirdPartyAddress } from '@roochnetwork/rooch-sdk';

// We need to access the wallet store directly since we can't use React hooks in a class
// This will be injected by the component that creates the provider
interface WalletStoreAccess {
  getCurrentWallet: () => any;
  getCurrentAddress: () => ThirdPartyAddress | undefined;
  getConnectionStatus: () => 'disconnected' | 'connecting' | 'connected';
  forceDisconnect: () => void;
}

/**
 * Wallet Authentication Provider
 *
 * Implements AuthProvider interface for Rooch wallet authentication
 */
export class WalletAuthProvider implements AuthProvider {
  readonly type: AuthMethod = AuthMethod.WALLET;

  private currentUserDid: string | null = null;
  private walletStoreAccess: WalletStoreAccess | null = null;

  constructor(walletStoreAccess?: WalletStoreAccess) {
    this.currentUserDid = AuthStore.getCurrentUserDid();
    this.walletStoreAccess = walletStoreAccess || null;

    // Check if current user is a wallet user
    if (this.currentUserDid && UserStore.getAuthMethod(this.currentUserDid) === AuthMethod.WALLET) {
      // Try to restore wallet connection
      this.tryRestoreWalletConnection();
    }
  }

  /**
   * Set wallet store access (called by components that have access to the store)
   */
  setWalletStoreAccess(walletStoreAccess: WalletStoreAccess): void {
    this.walletStoreAccess = walletStoreAccess;
  }

  /**
   * Check if wallet store access is available
   */
  isWalletStoreReady(): boolean {
    return !!this.walletStoreAccess;
  }

  /**
   * Check if wallet authentication is supported
   * Always return true to show the wallet tab, wallet availability will be checked during connection
   */
  async isSupported(): Promise<boolean> {
    // Always show wallet tab in browser environment
    // Actual wallet availability will be checked when user tries to connect
    if (typeof window === 'undefined') {
      console.debug('[WalletAuthProvider] Not in browser environment');
      return false;
    }

    console.debug('[WalletAuthProvider] Wallet authentication tab is always available');
    return true;
  }

  /**
   * Check if any supported wallet extensions are installed
   * This is called during the actual connection attempt
   */
  private checkWalletAvailability(): {
    hasWallet: boolean;
    availableWallets: string[];
    allWallets: string[];
  } {
    const walletChecks = {
      UniSat: typeof (window as any).unisat !== 'undefined',
      OKX: typeof (window as any).okxwallet?.bitcoin !== 'undefined',
      OneKey: typeof (window as any).$onekey?.btc !== 'undefined',
    };

    const availableWallets = Object.entries(walletChecks)
      .filter(([, isAvailable]) => isAvailable)
      .map(([name]) => name);

    const allWallets = Object.keys(walletChecks);

    return {
      hasWallet: availableWallets.length > 0,
      availableWallets,
      allWallets,
    };
  }

  /**
   * Perform wallet login/connection
   */
  async login(_options?: LoginOptions): Promise<AuthResult> {
    try {
      // First check if any wallets are available
      const walletAvailability = this.checkWalletAvailability();

      if (!walletAvailability.hasWallet) {
        const isDev = import.meta.env.DEV;
        const errorMessage = isDev
          ? `No Bitcoin wallets detected. Please install one of the supported wallets: ${walletAvailability.allWallets.join(', ')}. For development, you can install UniSat or OKX wallet.`
          : `No Bitcoin wallets found. Please install one of the supported wallets: ${walletAvailability.allWallets.join(', ')}.`;

        throw new Error(errorMessage);
      }

      console.info('[WalletAuthProvider] Available wallets:', walletAvailability.availableWallets);

      if (!this.walletStoreAccess) {
        throw new Error(
          '[WalletAuthProvider] Wallet store access not available. Make sure WalletProvider is properly initialized.'
        );
      }

      // Check if wallet is already connected
      const connectionStatus = this.walletStoreAccess.getConnectionStatus();
      const currentAddress = this.walletStoreAccess.getCurrentAddress();

      if (connectionStatus !== 'connected' || !currentAddress) {
        throw new Error(
          '[WalletAuthProvider] Wallet not connected. Please connect your wallet first.'
        );
      }

      // Get Bitcoin address (ThirdPartyAddress should be BitcoinAddress in this context)
      const bitcoinAddress = currentAddress.toStr();

      // Create User DID using Bitcoin address format
      const userDid = this.createUserDidFromBitcoinAddress(bitcoinAddress);

      // Find or create user
      const { isNewUser } = await this._findOrCreateUser(bitcoinAddress, userDid);

      // Update current state
      this.currentUserDid = userDid;
      AuthStore.setCurrentUserDid(userDid);

      // Login successful

      return {
        userDid,
        authMethod: AuthMethod.WALLET,
        authIdentifier: bitcoinAddress,
        isNewUser,
      };
    } catch (error) {
      console.error('[WalletAuthProvider] Login failed:', error);
      throw error;
    }
  }

  /**
   * Try to restore previous session
   */
  async restoreSession(): Promise<boolean> {
    try {
      if (!this.walletStoreAccess) {
        return false;
      }

      // Check if wallet is still connected
      let connectionStatus = this.walletStoreAccess.getConnectionStatus();
      let currentAddress = this.walletStoreAccess.getCurrentAddress();

      // Check wallet state

      if (connectionStatus !== 'connected' || !currentAddress) {
        // Try to reconnect the wallet
        try {
          const currentWallet = this.walletStoreAccess.getCurrentWallet();
          if (currentWallet && typeof currentWallet.connect === 'function') {
            await currentWallet.connect();

            // Check again after reconnection attempt
            const newConnectionStatus = this.walletStoreAccess.getConnectionStatus();
            const newCurrentAddress = this.walletStoreAccess.getCurrentAddress();

            // Check reconnection result

            if (newConnectionStatus !== 'connected' || !newCurrentAddress) {
              return false;
            }

            // Update for the rest of the function
            connectionStatus = newConnectionStatus;
            currentAddress = newCurrentAddress;
          } else {
            return false;
          }
        } catch (error) {
          return false;
        }
      }

      // Get current user DID from storage
      const currentUserDid = AuthStore.getCurrentUserDid();
      if (!currentUserDid) {
        return false;
      }

      // Verify the wallet address matches the stored user DID
      const bitcoinAddress = currentAddress.toStr();
      const expectedUserDid = this.createUserDidFromBitcoinAddress(bitcoinAddress);

      // Verify address matches stored user DID

      if (expectedUserDid !== currentUserDid) {
        return false;
      }

      // Update current state
      this.currentUserDid = currentUserDid;

      // Session restored successfully
      return true;
    } catch (error) {
      console.error('[WalletAuthProvider] Session restore failed:', error);
      return false;
    }
  }

  /**
   * Perform logout
   */
  async logout(): Promise<void> {
    try {
      // Disconnect wallet if connected to prevent auto-reconnect
      if (this.walletStoreAccess) {
        const connectionStatus = this.walletStoreAccess.getConnectionStatus();

        if (connectionStatus === 'connected') {
          // First try to force disconnect through the store
          this.walletStoreAccess.forceDisconnect();

          // Also clear rooch-sdk-kit wallet storage to prevent auto-reconnect
          // This is similar to what the DropdownMenu component does
          const prefix = 'rooch-sdk-kit';
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith(prefix)) {
              localStorage.removeItem(key);
            }
          });
        }
      }

      this.currentUserDid = null;
    } catch (error) {
      console.error('[WalletAuthProvider] Logout error:', error);
      throw error;
    }
  }

  /**
   * Get user identifier for a given User DID
   */
  getUserIdentifier(userDid: string): string | null {
    return this.extractBitcoinAddressFromDID(userDid);
  }

  /**
   * Get current user DID
   */
  getUserDid(): string | null {
    return this.currentUserDid;
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return !!this.currentUserDid;
  }

  /**
   * Try to restore wallet connection (for session restore)
   */
  private async tryRestoreWalletConnection(): Promise<void> {
    try {
      // This will be implemented when we integrate with the wallet store
      // Check if wallet is still connected and restore the connection
      // TODO: Implement wallet connection restoration
    } catch (error) {
      // Restore connection failed, continue without error
    }
  }

  /**
   * Create User DID from Bitcoin address
   */
  private createUserDidFromBitcoinAddress(bitcoinAddress: string): string {
    return `did:bitcoin:${bitcoinAddress}`;
  }

  /**
   * Extract Bitcoin address from DID
   */
  private extractBitcoinAddressFromDID(userDid: string): string | null {
    if (userDid.startsWith('did:bitcoin:')) {
      return userDid.replace('did:bitcoin:', '');
    }
    return null;
  }

  /**
   * Check if user exists or create new wallet user
   */
  private async _findOrCreateUser(
    bitcoinAddress: string,
    userDid: string
  ): Promise<{ userDid: string; isNewUser: boolean }> {
    // Check if user already exists by searching for the Bitcoin DID
    const existingUserDid = this.findUserByBitcoinAddress(bitcoinAddress);
    let isNewUser = false;

    if (!existingUserDid) {
      // Create new wallet user
      UserStore.addWalletUser(userDid, bitcoinAddress);
      isNewUser = true;
    } else {
      // Found existing user
    }

    return { userDid: existingUserDid || userDid, isNewUser };
  }

  /**
   * Find user by Bitcoin address
   */
  private findUserByBitcoinAddress(bitcoinAddress: string): string | null {
    const targetDid = `did:bitcoin:${bitcoinAddress}`;
    const user = UserStore.getUser(targetDid);
    return user ? targetDid : null;
  }
}
