import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthContextType } from './types';


const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  userDid: null,
  error: null,
  signIn: () => {},
  signInWithDid: () => {},
  signOut: () => {},
  refreshSession: async () => {},
  updateSession: () => {},
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
  const [state, setState] = useState<Omit<AuthContextType, 'signIn' | 'signInWithDid' | 'signOut' | 'refreshSession' | 'updateSession'>>({
    isAuthenticated: false,
    isLoading: true,
    userDid: null,
    error: null,
  });

  const signInWithDid = useCallback((userDid: string) => {
    localStorage.setItem('userDid', userDid);
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      isLoading: false,
      userDid,
      error: null,
    }));
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('userDid');
    setState({
      isAuthenticated: false,
      isLoading: false,
      session: null,
      userDid: null,
      error: null,
    });
  }, []);


  useEffect(() => {
    const storedDid = localStorage.getItem('userDid');
    if (storedDid) {
      try {
        setState({
          isAuthenticated: true,
          isLoading: false,
          userDid: storedDid,
          error: null,
        });
      } catch (error) {
        console.error('Failed to restore session:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, userDid: storedDid, isAuthenticated: !!storedDid, isLoading: false }));
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    signInWithDid,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 