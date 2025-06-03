export interface User {
  id: string;
  email?: string;
  display_name?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Session {
  session_token: string;
  expires_at: string;
  user: User;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: Session | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signIn: (session: Session) => void;
  signOut: () => void;
  updateSession: (updates: Partial<Session>) => void;
} 