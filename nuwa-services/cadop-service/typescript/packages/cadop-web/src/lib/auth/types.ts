export interface UserSession {
  id: string;
  email?: string;
  did?: string;
  agent_did?: string;
  sybil_level?: number;
  created_at: string;
  last_sign_in_at: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: UserSession | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signIn: (session: UserSession) => void;
  signOut: () => void;
  updateSession: (updates: Partial<UserSession>) => void;
} 