export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userDid: string | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signInWithDid: (userDid: string) => void;
  signOut: () => void;
} 