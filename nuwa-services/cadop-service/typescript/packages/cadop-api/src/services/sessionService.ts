import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export interface Session {
  id: string;
  user_id: string;
  passkey_credential_id: string;
  session_token: string;
  expires_at: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export class SessionService {
  private generateSessionToken(userId: string, metadata: Record<string, any> = {}) {
    const now = Math.floor(Date.now() / 1000);
    
    const sessionToken = jwt.sign(
      {
        sub: userId,
        metadata,
        iat: now,
        exp: now + 7 * 24 * 3600 // 7 days
      },
      JWT_SECRET
    );

    return {
      sessionToken,
      expiresIn: 7 * 24 * 3600 // 7 days
    };
  }

  async createSession(
    userId: string, 
    passkeyCredentialId: string,
    metadata: Record<string, any> = {}
  ): Promise<Session> {
    const { sessionToken, expiresIn } = this.generateSessionToken(userId, metadata);
    
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        user_id: userId,
        passkey_credential_id: passkeyCredentialId,
        session_token: sessionToken,
        expires_at: expiresAt,
        metadata
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return session as Session;
  }

  async validateSession(sessionToken: string): Promise<{
    valid: boolean;
    userId?: string;
    metadata?: Record<string, any>;
  }> {
    try {
      const payload = jwt.verify(sessionToken, JWT_SECRET) as jwt.JwtPayload;

      const { data: session, error } = await supabase
        .from('sessions')
        .select()
        .eq('session_token', sessionToken)
        .single();

      if (error || !session) {
        return { valid: false };
      }

      return {
        valid: true,
        userId: payload.sub,
        metadata: payload.metadata
      };
    } catch (error) {
      return { valid: false };
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to invalidate session: ${error.message}`);
    }
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to invalidate user sessions: ${error.message}`);
    }
  }

  async getUserInfo(userId: string): Promise<{
    email?: string;
    display_name?: string;
    metadata?: Record<string, any>;
    created_at: string;
    updated_at: string;
  }> {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user info: ${error.message}`);
    }

    return {
      email: user.email,
      display_name: user.display_name,
      metadata: user.metadata,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  }
} 