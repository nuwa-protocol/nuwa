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
const initializeAuthProviders = () => {
  // Register Passkey provider
  authProviderRegistry.register('passkey', async () => new PasskeyAuthProvider());
  // Register Wallet provider
  authProviderRegistry.register('wallet', async () => new WalletAuthProvider());
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
      // Logout from current auth provider
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
    return await authProviderRegistry.getSupportedMethods();
  }, []);

  const getCurrentAuthProvider = useCallback((): IAuthProvider | null => {
    return currentAuthProvider;
  }, [currentAuthProvider]);

  const trySilentAuth = useCallback(async (): Promise<boolean> => {
    try {
      // NOTE: Silent auth is disabled because mediation: 'silent' often still shows prompts
      // Users should explicitly choose their authentication method
      console.debug('[AuthContext] Silent auth skipped - users must explicitly choose auth method');
      return false;

      // TODO: In the future, we could implement true silent auth by:
      // 1. Checking if user has valid session tokens
      // 2. Validating stored credentials without WebAuthn calls
      // 3. Only for wallet users, checking if wallet is still connected
    } catch (error) {
      console.debug('[AuthContext] Silent auth failed:', error);
      return false;
    }
  }, []);

  // Bootstrap flow - enhanced for multi-auth support
  useEffect(() => {
    async function bootstrapAuth() {
      try {
        // Initialize auth providers
        initializeAuthProviders();

        // Step 1: Check if we have a current user DID
        const currentUserDid = AuthStore.getCurrentUserDid();

        if (currentUserDid) {
          // User is already authenticated, restore session
          const authMethod = UserStore.getAuthMethod(currentUserDid);
          if (authMethod) {
            try {
              const provider = await authProviderRegistry.get(authMethod);

              // Try to restore the session
              let sessionRestored = false;
              if (provider instanceof PasskeyAuthProvider) {
                sessionRestored = await provider.restoreSession();
              }

              if (sessionRestored) {
                setState({
                  isAuthenticated: true,
                  isLoading: false,
                  userDid: currentUserDid,
                  authMethod,
                  error: null,
                });
                setCurrentAuthProvider(provider);
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
