import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthContextType } from './types';
import type { Session } from '@cadop/shared';
import { apiClient } from '../api/client';

const SESSION_STORAGE_KEY = 'cadop_session';

const defaultAuthContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  session: null,
  error: null,
  signIn: () => {},
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
  const [state, setState] = useState<Omit<AuthContextType, 'signIn' | 'signOut' | 'refreshSession' | 'updateSession'>>({
    isAuthenticated: false,
    isLoading: true,
    session: null,
    error: null,
  });

  // 自动刷新会话
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const scheduleRefresh = (expiresAt: string) => {
      const expiresTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiry = expiresTime - now;
      
      // 在过期前 5 分钟刷新
      const refreshTime = Math.max(0, timeUntilExpiry - 5 * 60 * 1000);
      
      timeoutId = setTimeout(async () => {
        try {
          await refreshSession();
        } catch (error) {
          console.error('Failed to refresh session:', error);
          // 如果刷新失败，清除会话
          signOut();
        }
      }, refreshTime);
    };

    if (state.session?.expires_at) {
      scheduleRefresh(state.session.expires_at);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [state.session?.expires_at]);

  useEffect(() => {
    // 从 sessionStorage 恢复会话
    const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as Session;
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

  const signIn = useCallback((session: Session) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setState({
      isAuthenticated: true,
      isLoading: false,
      session,
      error: null,
    });
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setState({
      isAuthenticated: false,
      isLoading: false,
      session: null,
      error: null,
    });
  }, []);

  const refreshSession = useCallback(async () => {
    if (!state.session?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await apiClient.post('/api/auth/refresh', {
        refresh_token: state.session.refresh_token
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const newSession = response.data as Session;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      
      setState(prev => ({
        ...prev,
        session: newSession
      }));
    } catch (error) {
      console.error('Failed to refresh session:', error);
      throw error;
    }
  }, [state.session?.refresh_token]);

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

  const value: AuthContextType = {
    ...state,
    signIn,
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