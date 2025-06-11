import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthContextType } from './types';
import type { Session } from '@cadop/shared';

const SESSION_STORAGE_KEY = 'cadop_session';

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  session: null,
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
    session: null,
    userDid: null,
    error: null,
  });

  const signIn = useCallback((session: Session) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      isLoading: false,
      session,
      error: null,
    }));
  }, []);

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
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('userDid');
    setState({
      isAuthenticated: false,
      isLoading: false,
      session: null,
      userDid: null,
      error: null,
    });
  }, []);

  const updateSession = useCallback((updates: Partial<Session>) => {
    setState(prev => {
      if (!prev.session) return prev;

      const updatedSession = { ...prev.session, ...updates };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
      
      return {
        ...prev,
        session: updatedSession,
      };
    });
  }, []);

  const refreshSession = useCallback(async () => {
    console.log('TODO: refreshSession');
  }, []);

  useEffect(() => {
    // restore session from sessionStorage
    const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const storedDid = localStorage.getItem('userDid');
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as Session;
        setState({
          isAuthenticated: true,
          isLoading: false,
          session,
          userDid: storedDid,
          error: null,
        });
      } catch (error) {
        console.error('Failed to restore session:', error);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, userDid: storedDid, isAuthenticated: !!storedDid, isLoading: false }));
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    signIn,
    signInWithDid,
    signOut,
    refreshSession,
    updateSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 