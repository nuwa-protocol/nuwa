import { logger } from '../utils/logger.js';
import { BaseRepository, BaseRecord } from './base.js';
import { Database } from '../config/supabase.js';

export interface UserRecord extends BaseRecord {
  user_did: string;
  email?: string;
  display_name?: string;
  sybil_level: number;
  metadata: Record<string, any>;
}

// For type checking against database schema
type DbUserRecord = Database['public']['Tables']['users']['Row'];
type DbUserInsert = Database['public']['Tables']['users']['Insert'];
type DbUserUpdate = Database['public']['Tables']['users']['Update'];

export class UserRepository extends BaseRepository<UserRecord> {
  constructor() {
    super('users');
  }

  protected mapToRecord(data: any): UserRecord {
    return {
      id: data.id,
      user_did: data.user_did,
      email: data.email,
      display_name: data.display_name,
      sybil_level: data.sybil_level,
      metadata: data.metadata || {},
      created_at: this.deserializeDate(data.created_at),
      updated_at: this.deserializeDate(data.updated_at)
    };
  }

  /**
   * Find a user by email
   * @param email - The email to search for
   * @returns The user or null if not found
   */
  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.customQuery(query =>
      query
        .select()
        .eq('email', email)
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Find a user by DID
   * @param did - The DID to search for
   * @returns The user or null if not found
   */
  async findByDID(did: string): Promise<UserRecord | null> {
    const result = await this.customQuery(query =>
      query
        .select()
        .eq('user_did', did)
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Find users by sybil level
   * @param level - The sybil level to search for
   * @returns Array of users
   */
  async findBySybilLevel(level: number): Promise<UserRecord[]> {
    const result = await this.customQuery<UserRecord[]>(query =>
      query
        .select()
        .eq('sybil_level', level)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }
} 