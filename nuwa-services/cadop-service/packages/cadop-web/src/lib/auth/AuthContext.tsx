import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthContextType } from './types';
import { AuthStore, UserStore } from '../storage';
import { AuthMethod } from '../storage/types';
import {
  AuthProvider as IAuthProvider,
  AuthResult,
  LoginOptions,
  authProviderRegistry,
} from './providers';
import { PasskeyAuthProvider } from './providers/PasskeyAuthProvider';
import { WalletAuthProvider } from './providers/WalletAuthProvider';
import { WalletStoreConnector } from './providers/WalletStoreConnector';
import { useWalletAuth } from '../../hooks/useWalletAuth';

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  userDid: null,
  authMethod: null,
  error: null,
  signInWithDid: () => {},
  signOut: () => {},
  loginWithProvider: async () => {
    throw new Error('Not implemented');
  },
  getSupportedAuthMethods: async () => [],
  getCurrentAuthProvider: () => null,
  trySilentAuth: async () => false,
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

// Initialize auth providers
let providersInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializeAuthProviders = async (): Promise<void> => {
  if (providersInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.info('[AuthContext] Initializing auth providers...');

      // Register Passkey provider
      authProviderRegistry.register(AuthMethod.PASSKEY, async () => new PasskeyAuthProvider());

      // Register Wallet provider
      authProviderRegistry.register(AuthMethod.WALLET, async () => new WalletAuthProvider());

      providersInitialized = true;
      console.info('[AuthContext] Auth providers initialized successfully');
    } catch (error) {
      console.error('[AuthContext] Failed to initialize auth providers:', error);
      throw error;
    }
  })();

  return initializationPromise;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<
    Omit<
      AuthContextType,
      | 'signInWithDid'
      | 'signOut'
      | 'loginWithProvider'
      | 'getSupportedAuthMethods'
      | 'getCurrentAuthProvider'
      | 'trySilentAuth'
    >
  >({
    isAuthenticated: false,
    isLoading: true,
    userDid: null,
    authMethod: null,
    error: null,
  });

  const [currentAuthProvider, setCurrentAuthProvider] = useState<IAuthProvider | null>(null);

  // Use the new wallet auth hook
  const walletAuth = useWalletAuth();

  // Initialize auth providers immediately when component mounts
  React.useEffect(() => {
    initializeAuthProviders().catch(error => {
      console.error('[AuthContext] Failed to initialize auth providers:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to initialize authentication providers',
        isLoading: false,
      }));
    });
  }, []);

  // Note: Removed wallet auth success event listener - now using structured return values

  const signInWithDid = useCallback((userDid: string) => {
    try {
      AuthStore.setCurrentUserDid(userDid);
      const authMethod = UserStore.getAuthMethod(userDid);
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        userDid,
        authMethod,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      }));
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Logout from current auth provider (this will handle wallet disconnect if needed)
      if (currentAuthProvider) {
        await currentAuthProvider.logout();
      }

      AuthStore.clearCurrentUser();
      setCurrentAuthProvider(null);
      setState({
        isAuthenticated: false,
        isLoading: false,
        userDid: null,
        authMethod: null,
        error: null,
      });
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
      // Still clear the state even if logout fails
      AuthStore.clearCurrentUser();
      setCurrentAuthProvider(null);
      setState({
        isAuthenticated: false,
        isLoading: false,
        userDid: null,
        authMethod: null,
        error: null,
      });
    }
  }, [currentAuthProvider]);

  // New authentication methods
  const loginWithProvider = useCallback(
    async (authMethod: AuthMethod, options?: LoginOptions): Promise<AuthResult> => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const provider = await authProviderRegistry.get(authMethod);
        const result = await provider.login(options);

        // Update state
        setState({
          isAuthenticated: true,
          isLoading: false,
          userDid: result.userDid,
          authMethod: result.authMethod,
          error: null,
        });

        setCurrentAuthProvider(provider);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    []
  );

  const getSupportedAuthMethods = useCallback(async (): Promise<AuthMethod[]> => {
    try {
      // Ensure providers are initialized before checking support
      await initializeAuthProviders();

      const methods = await authProviderRegistry.getSupportedMethods();
      console.info('[AuthContext] Supported auth methods:', methods);

      return methods;
    } catch (error) {
      console.error('[AuthContext] Failed to get supported auth methods:', error);
      // Fallback to Passkey only
      return [AuthMethod.PASSKEY];
    }
  }, []);

  const getCurrentAuthProvider = useCallback((): IAuthProvider | null => {
    return currentAuthProvider;
  }, [currentAuthProvider]);

  const trySilentAuth = useCallback(async (): Promise<boolean> => {
    try {
      // NOTE: Silent auth is disabled because mediation: 'silent' often still shows prompts
      // Users should explicitly choose their authentication method
      return false;

      // TODO: In the future, we could implement true silent auth by:
      // 1. Checking if user has valid session tokens
      // 2. Validating stored credentials without WebAuthn calls
      // 3. Only for wallet users, checking if wallet is still connected
    } catch (error) {
      return false;
    }
  }, []);

  // Bootstrap flow - enhanced for multi-auth support
  useEffect(() => {
    async function bootstrapAuth() {
      try {
        // Step 1: Check if we have a current user DID
        const currentUserDid = AuthStore.getCurrentUserDid();

        if (currentUserDid) {
          // User is already authenticated, restore session
          const authMethod = UserStore.getAuthMethod(currentUserDid);

          if (authMethod) {
            try {
              let sessionRestored = false;

              // Use the new wallet auth hook for wallet authentication
              if (authMethod === AuthMethod.WALLET) {
                const walletAuthResult = await walletAuth.restoreSession();

                if (walletAuthResult.success) {
                  // Session restored successfully
                  sessionRestored = true;
                } else if (walletAuthResult.isWaiting) {
                  // Waiting for wallet auto-connect: keep user authenticated while waiting
                  setState({
                    isAuthenticated: true, // Keep user authenticated
                    isLoading: false,
                    userDid: currentUserDid,
                    authMethod,
                    error: null,
                  });
                  return; // Don't proceed to clear auth state
                } else {
                  // Explicit failure: proceed to clear state
                  sessionRestored = false;
                }
              } else {
                // For non-wallet auth methods, use the traditional approach
                const provider = await authProviderRegistry.get(authMethod);

                if (provider.restoreSession) {
                  sessionRestored = await provider.restoreSession();
                }

                if (sessionRestored) {
                  setCurrentAuthProvider(provider);
                }
              }

              if (sessionRestored) {
                setState({
                  isAuthenticated: true,
                  isLoading: false,
                  userDid: currentUserDid,
                  authMethod,
                  error: null,
                });
              } else {
                // Session restore failed, clear auth state
                AuthStore.clearCurrentUser();
                setState({
                  isAuthenticated: false,
                  isLoading: false,
                  userDid: null,
                  authMethod: null,
                  error: null,
                });
              }
            } catch (error) {
              console.error('[AuthContext] Session restore failed:', error);
              AuthStore.clearCurrentUser();
              setState({
                isAuthenticated: false,
                isLoading: false,
                userDid: null,
                authMethod: null,
                error: null,
              });
            }
          } else {
            // Unknown auth method, clear state
            console.warn('[AuthContext] Unknown auth method, clearing state');
            AuthStore.clearCurrentUser();
            setState({
              isAuthenticated: false,
              isLoading: false,
              userDid: null,
              authMethod: null,
              error: null,
            });
          }
        } else {
          // No current user, try silent authentication
          const silentAuthSuccess = await trySilentAuth();

          if (!silentAuthSuccess) {
            setState({
              isAuthenticated: false,
              isLoading: false,
              userDid: null,
              authMethod: null,
              error: null,
            });
          }
        }
      } catch (error) {
        // Something went wrong in the authentication process
        console.error('[AuthContext] Bootstrap error:', error);
        setState({
          isAuthenticated: false,
          isLoading: false,
          userDid: null,
          authMethod: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    bootstrapAuth();
  }, [trySilentAuth]);

  const value: AuthContextType = {
    ...state,
    signInWithDid,
    signOut,
    loginWithProvider,
    getSupportedAuthMethods,
    getCurrentAuthProvider,
    trySilentAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      <WalletStoreConnector />
      {children}
    </AuthContext.Provider>
  );
}
