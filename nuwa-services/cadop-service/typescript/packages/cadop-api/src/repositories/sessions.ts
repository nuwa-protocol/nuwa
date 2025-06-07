import { logger } from '../utils/logger.js';
import { BaseRepository, BaseRecord } from './base.js';
import { supabase } from '../config/supabase.js';

export interface SessionRecord extends BaseRecord {
  user_id: string;
  authenticator_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date;
  metadata: Record<string, any>;
}

export class SessionRepository extends BaseRepository<SessionRecord> {
  constructor() {
    super('sessions');
  }

  protected mapToRecord(data: any): SessionRecord {
    return {
      id: data.id,
      user_id: data.user_id,
      authenticator_id: data.authenticator_id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_expires_at: this.deserializeDate(data.access_token_expires_at),
      refresh_token_expires_at: this.deserializeDate(data.refresh_token_expires_at),
      metadata: data.metadata || {},
      created_at: this.deserializeDate(data.created_at),
      updated_at: this.deserializeDate(data.updated_at)
    };
  }

  /**
   * Find a session by access token
   * @param token - The access token to find the session by
   * @returns The session or null if not found
   */
  async findByAccessToken(token: string): Promise<SessionRecord | null> {
    const result = await this.customQuery<SessionRecord>(query => 
      query
        .select()
        .eq('access_token', token)
        .gt('access_token_expires_at', new Date().toISOString())
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Find a session by refresh token
   * @param token - The refresh token to find the session by
   * @returns The session or null if not found
   */
  async findByRefreshToken(token: string): Promise<SessionRecord | null> {
    const result = await this.customQuery<SessionRecord>(query => 
      query
        .select()
        .eq('refresh_token', token)
        .gt('refresh_token_expires_at', new Date().toISOString())
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Find sessions by user ID
   * @param userId - The user ID to find sessions for
   * @returns Array of sessions
   */
  async findByUserId(userId: string): Promise<SessionRecord[]> {
    const result = await this.customQuery<SessionRecord[]>(query =>
      query
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }

  /**
   * Find sessions by authenticator ID
   * @param authenticatorId - The authenticator ID to find sessions for
   * @returns Array of sessions
   */
  async findByAuthenticatorId(authenticatorId: string): Promise<SessionRecord[]> {
    const result = await this.customQuery<SessionRecord[]>(query =>
      query
        .select()
        .eq('authenticator_id', authenticatorId)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }

  /**
   * Update access token expiration time
   * @param id - The session ID
   * @param expiresAt - The new expiration time
   */
  async updateAccessTokenExpiry(id: string, expiresAt: Date): Promise<void> {
    await this.update(id, {
      access_token_expires_at: expiresAt,
      updated_at: new Date()
    });
  }

  /**
   * Update refresh token expiration time
   * @param id - The session ID
   * @param expiresAt - The new expiration time
   */
  async updateRefreshTokenExpiry(id: string, expiresAt: Date): Promise<void> {
    await this.update(id, {
      refresh_token_expires_at: expiresAt,
      updated_at: new Date()
    });
  }

  /**
   * Delete all sessions for a user
   * @param userId - The user ID
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.customQuery(query => 
      query
        .delete()
        .eq('user_id', userId)
    );
  }

  /**
   * Delete all sessions for an authenticator
   * @param authenticatorId - The authenticator ID
   */
  async deleteByAuthenticatorId(authenticatorId: string): Promise<void> {
    await this.customQuery(query => 
      query
        .delete()
        .eq('authenticator_id', authenticatorId)
    );
  }

  /**
   * Clean up expired sessions
   * @returns Number of sessions deleted
   */
  async deleteExpired(): Promise<number> {
    const { data, error } = await supabase.rpc('cleanup_expired_sessions');

    if (error) {
      logger.error('Failed to cleanup expired sessions:', error);
      throw error;
    }

    return data || 0;
  }
} 