import type { Session } from '@cadop/shared';

export interface User {
  id: string;
  email?: string;
  display_name?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  primaryAgentDid?: string;
  sybilLevel?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: Session | null;
  /** 基于 Passkey 生成的本地 DID */
  userDid: string | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  /** 通过旧 Session 登录（兼容） */
  signIn: (session: Session) => void;
  /** 通过本地 Passkey 登录 */
  signInWithDid: (userDid: string) => void;
  signOut: () => void;
  refreshSession: () => Promise<void>;
  updateSession: (updates: Partial<Session>) => void;
} 