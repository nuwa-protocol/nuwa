import { logger } from '../utils/logger.js';
import { BaseRepository, BaseRecord } from './base.js';
import { supabase } from '../config/supabase.js';

export interface WebAuthnChallengeRecord extends BaseRecord {
  user_id?: string;
  challenge: string;
  operation_type: 'registration' | 'authentication';
  client_data: Record<string, any>;
  expires_at: Date;
  used_at?: Date;
}

export class WebAuthnChallengesRepository extends BaseRepository<WebAuthnChallengeRecord> {
  constructor() {
    super('webauthn_challenges');
  }

  protected mapToRecord(data: any): WebAuthnChallengeRecord {
    return {
      id: data.id,
      user_id: data.user_id,
      challenge: data.challenge,
      operation_type: data.operation_type,
      client_data: data.client_data || {},
      expires_at: this.deserializeDate(data.expires_at),
      used_at: data.used_at ? this.deserializeDate(data.used_at) : undefined,
      created_at: this.deserializeDate(data.created_at),
      updated_at: this.deserializeDate(data.updated_at)
    };
  }

  async getByChallenge(challenge: string): Promise<WebAuthnChallengeRecord | null> {
    const result = await this.customQuery<WebAuthnChallengeRecord>(query =>
      query
        .select()
        .eq('challenge', challenge)
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  async getLatestActiveChallenge(
    userId: string | null,
    operationType: 'registration' | 'authentication'
  ): Promise<WebAuthnChallengeRecord | null> {
    const result = await this.customQuery<WebAuthnChallengeRecord>(query =>
      query
        .select()
        .eq('operation_type', operationType)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .is('user_id', userId || null)
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  async markAsUsed(id: string): Promise<WebAuthnChallengeRecord> {
    return this.update(id, {
      used_at: new Date()
    });
  }

  async cleanupExpired(): Promise<number> {
    const { data, error } = await supabase.rpc('cleanup_expired_webauthn_challenges');

    if (error) {
      logger.error('Failed to cleanup expired WebAuthn challenges:', error);
      throw error;
    }

    return data || 0;
  }

  async getActiveByUserId(userId: string): Promise<WebAuthnChallengeRecord[]> {
    const result = await this.customQuery<WebAuthnChallengeRecord[]>(query =>
      query
        .select()
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }
} 