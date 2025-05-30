import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthContextType, UserSession } from './types';

const SESSION_STORAGE_KEY = 'cadop_user_session';

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  session: null,
  error: null,
  signIn: () => {},
  signOut: () => {},
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
  const [state, setState] = useState<Omit<AuthContextType, 'signIn' | 'signOut' | 'updateSession'>>({
    isAuthenticated: false,
    isLoading: true,
    session: null,
    error: null,
  });

  useEffect(() => {
    // 从 sessionStorage 恢复会话
    const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as UserSession;
        setState({
          isAuthenticated: true,
          isLoading: false,
          session,
          error: null,
        });
      } catch (error) {
        console.error('Failed to restore session:', error);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const signIn = (session: UserSession) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setState({
      isAuthenticated: true,
      isLoading: false,
      session,
      error: null,
    });
  };

  const signOut = () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setState({
      isAuthenticated: false,
      isLoading: false,
      session: null,
      error: null,
    });
  };

  const updateSession = (updates: Partial<UserSession>) => {
    setState(prev => {
      if (!prev.session) return prev;

      const updatedSession = { ...prev.session, ...updates };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession));
      
      return {
        ...prev,
        session: updatedSession,
      };
    });
  };

  const value: AuthContextType = {
    ...state,
    signIn,
    signOut,
    updateSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 