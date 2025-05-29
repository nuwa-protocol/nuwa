import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabase = createClient(
  process.env['REACT_APP_SUPABASE_URL'] || '',
  process.env['REACT_APP_SUPABASE_ANON_KEY'] || ''
);

export interface User {
  id: string;
  email?: string | undefined;
  userMetadata?: Record<string, any>;
  sybilLevel?: number;
  primaryAgentDid?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setAuthState({
          user: null,
          loading: false,
          error: error.message
        });
        return;
      }

      if (session?.user) {
        setAuthState({
          user: {
            id: session.user.id,
            email: session.user.email || undefined,
            userMetadata: session.user.user_metadata
          },
          loading: false,
          error: null
        });
      } else {
        setAuthState({
          user: null,
          loading: false,
          error: null
        });
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthState({
          user: {
            id: session.user.id,
            email: session.user.email || undefined,
            userMetadata: session.user.user_metadata
          },
          loading: false,
          error: null
        });
      } else {
        setAuthState({
          user: null,
          loading: false,
          error: null
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const getIdToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  return {
    ...authState,
    signIn,
    signUp,
    signOut,
    getIdToken,
  };
}; 