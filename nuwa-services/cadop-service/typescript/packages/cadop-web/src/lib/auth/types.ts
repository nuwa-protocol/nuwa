import { AuthMethod } from '../storage/types';
import { AuthProvider as IAuthProvider, AuthResult, LoginOptions } from './providers/types';

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userDid: string | null;
  authMethod: AuthMethod | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signInWithDid: (userDid: string) => void;
  signOut: () => void;

  // New methods for multi-auth support
  loginWithProvider: (authMethod: AuthMethod, options?: LoginOptions) => Promise<AuthResult>;
  getSupportedAuthMethods: () => Promise<AuthMethod[]>;
  getCurrentAuthProvider: () => IAuthProvider | null;
  trySilentAuth: () => Promise<boolean>;
}
