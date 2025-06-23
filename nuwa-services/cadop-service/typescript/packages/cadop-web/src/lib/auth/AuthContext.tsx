import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthContextType } from './types';
import { AuthStore, UserStore } from '../storage';
import { PasskeyService } from '../passkey/PasskeyService';

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  userDid: null,
  error: null,
  signInWithDid: () => {},
  signOut: () => {},
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

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<Omit<AuthContextType, 'signInWithDid' | 'signOut'>>({
    isAuthenticated: false,
    isLoading: true,
    userDid: null,
    error: null,
  });

  const signInWithDid = useCallback((userDid: string) => {
    try {
      AuthStore.setCurrentUserDid(userDid);
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        userDid,
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

  const signOut = useCallback(() => {
    AuthStore.clearCurrentUser();
    setState({
      isAuthenticated: false,
      isLoading: false,
      userDid: null,
      error: null,
    });
  }, []);

  // Bootstrap flow as described in auth-flow.md
  useEffect(() => {
    async function bootstrapAuth() {
      try {
        // Step 1: Check if we have a current user DID
        const currentUserDid = AuthStore.getCurrentUserDid();

        if (currentUserDid) {
          // User is already authenticated
          setState({
            isAuthenticated: true,
            isLoading: false,
            userDid: currentUserDid,
            error: null,
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            userDid: null,
            error: null,
          });
        }
      } catch (error) {
        // Something went wrong in the authentication process
        setState({
          isAuthenticated: false,
          isLoading: false,
          userDid: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    bootstrapAuth();
  }, []);

  const value: AuthContextType = {
    ...state,
    signInWithDid,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
