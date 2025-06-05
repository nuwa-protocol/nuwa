import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { CadopError, CadopErrorCode } from '@cadop/shared';
import { SessionRecord, SessionRepository } from '../repositories/sessions.js';
import { UserRecord, UserRepository } from '../repositories/users.js';
import { config } from '../config/environment.js';
import crypto from 'crypto';
import { Session } from '@cadop/shared';

export interface SessionWithUser {
  session: SessionRecord;
  user: UserRecord;
}

export function mapToSession(session_with_user: SessionWithUser): Session {
  return {
    id: session_with_user.session.id,
    accessToken: session_with_user.session.access_token,
    refreshToken: session_with_user.session.refresh_token,
    accessTokenExpiresAt: session_with_user.session.access_token_expires_at,
    refreshTokenExpiresAt: session_with_user.session.refresh_token_expires_at,
    metadata: session_with_user.session.metadata,
    user: {
      id: session_with_user.user.id,
      userDid: session_with_user.user.user_did,
      sybilLevel: session_with_user.user.sybil_level,
      email: session_with_user.user.email,
      displayName: session_with_user.user.display_name
    }
  }
}

export class SessionService {
  private readonly sessionRepo: SessionRepository;
  private readonly userRepo: UserRepository;
  private readonly accessTokenDuration: number = 24 * 60 * 60 * 1000;  // 24 hours
  private readonly refreshTokenDuration: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly renewThreshold: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.sessionRepo = new SessionRepository();
    this.userRepo = new UserRepository();
  }

  private generateTokens(userId: string, metadata: Record<string, any> = {}) {
    const now = Math.floor(Date.now() / 1000);
    
    // Generate access token
    const accessToken = jwt.sign(
      {
        sub: userId,
        type: 'access',
        metadata,
        iat: now,
        exp: now + this.accessTokenDuration / 1000
      },
      config.session.secret
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        sub: userId,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'), // Unique token ID
        iat: now,
        exp: now + this.refreshTokenDuration / 1000
      },
      config.session.secret
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + this.accessTokenDuration),
      refreshTokenExpiresAt: new Date(Date.now() + this.refreshTokenDuration)
    };
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    authenticatorId: string,
    metadata?: Record<string, any>
  ): Promise<SessionWithUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new CadopError("User not found", CadopErrorCode.USER_NOT_FOUND, {
        userId,
        authenticatorId,
        metadata
      });
    }

    const {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt
    } = this.generateTokens(userId, metadata);

    const session = await this.sessionRepo.create({
      user_id: userId,
      authenticator_id: authenticatorId,
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      metadata: metadata || {}
    });

    return {
      session,
      user,
    };
  }

  /**
   * Validate a session using access token
   */
  async validateSession(token: string): Promise<{
    valid: boolean;
    session?: SessionRecord;
    user?: UserRecord;
  }> {
    try {
      // Verify JWT first
      const payload = jwt.verify(token, config.session.secret) as jwt.JwtPayload;
      if (payload.type !== 'access') {
        return { valid: false };
      }

      const session = await this.sessionRepo.findByAccessToken(token);
      if (!session) {
        return { valid: false };
      }

      const user = await this.userRepo.findById(session.user_id);
      if (!user) {
        await this.sessionRepo.delete(session.id);
        return { valid: false };
      }

      return { valid: true, session, user };
    } catch (error) {
      logger.error('Session validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<SessionWithUser | null> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.session.secret) as jwt.JwtPayload;
      if (payload.type !== 'refresh') {
        return null;
      }

      // Find session
      const session = await this.sessionRepo.findByRefreshToken(refreshToken);
      if (!session) {
        return null;
      }

      // Get user
      const user = await this.userRepo.findById(session.user_id);
      if (!user) {
        await this.sessionRepo.delete(session.id);
        return null;
      }

      // Generate new access token
      const {
        accessToken,
        accessTokenExpiresAt
      } = this.generateTokens(user.id, session.metadata);

      // Update session
      const updatedSession = await this.sessionRepo.update(session.id, {
        access_token: accessToken,
        access_token_expires_at: accessTokenExpiresAt
      });

      return {
        session: updatedSession,
        user,
      };
    } catch (error) {
      logger.error('Token refresh error:', error);
      return null;
    }
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.sessionRepo.delete(sessionId);
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepo.deleteByUserId(userId);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    return this.sessionRepo.deleteExpired();
  }
} 