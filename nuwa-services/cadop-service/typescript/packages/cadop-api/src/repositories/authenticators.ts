import { BaseRepository, BaseRecord } from './base.js';
import { Database } from '../config/supabase.js';
import { AuthenticatorTransportFuture } from '@simplewebauthn/types';

type AuthenticatorAttachment = Database['public']['Enums']['authenticator_attachment'];

export interface AuthenticatorRecord extends BaseRecord {
  user_id: string;
  credential_id: string;
  credential_public_key: string;
  counter: number;
  credential_device_type: string;
  credential_backed_up: boolean;
  transports: AuthenticatorTransportFuture[];
  friendly_name?: string;
  aaguid?: string;
  last_used_at?: Date;
}

export class AuthenticatorRepository extends BaseRepository<AuthenticatorRecord> {
  constructor() {
    super('authenticators');
  }

  protected mapToRecord(data: any): AuthenticatorRecord {
    return {
      id: data.id,
      user_id: data.user_id,
      credential_id: data.credential_id,
      credential_public_key: data.credential_public_key,
      counter: data.counter,
      credential_device_type: data.credential_device_type,
      credential_backed_up: data.credential_backed_up,
      transports: data.transports || [],
      friendly_name: data.friendly_name,
      aaguid: data.aaguid,
      last_used_at: data.last_used_at ? this.deserializeDate(data.last_used_at) : undefined,
      created_at: this.deserializeDate(data.created_at),
      updated_at: this.deserializeDate(data.updated_at)
    };
  }

  /**
   * Find authenticators by user ID
   * @param userId - The user ID to find authenticators for
   * @returns Array of authenticators
   */
  async findByUserId(userId: string): Promise<AuthenticatorRecord[]> {
    const result = await this.customQuery<AuthenticatorRecord[]>(query =>
      query
        .select()
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }

  /**
   * Find an authenticator by credential ID
   * @param credentialId - The credential ID to find
   * @returns The authenticator or null if not found
   */
  async findByCredentialId(credentialId: string): Promise<AuthenticatorRecord | null> {
    const result = await this.customQuery(query =>
      query
        .select()
        .eq('credential_id', credentialId)
        .single()
    );

    return result ? this.mapToRecord(result) : null;
  }

  /**
   * Update authenticator counter
   * @param id - The authenticator ID
   * @param counter - The new counter value
   */
  async updateCounter(id: string, counter: number): Promise<void> {
    await this.update(id, {
      counter,
      last_used_at: new Date()
    });
  }

  /**
   * Update authenticator friendly name
   * @param id - The authenticator ID
   * @param friendlyName - The new friendly name
   */
  async updateFriendlyName(id: string, friendlyName: string): Promise<void> {
    await this.update(id, {
      friendly_name: friendlyName
    });
  }

  /**
   * Delete all authenticators for a user
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
   * Find authenticators by AAGUID
   * @param aaguid - The AAGUID to find authenticators for
   * @returns Array of authenticators
   */
  async findByAaguid(aaguid: string): Promise<AuthenticatorRecord[]> {
    const result = await this.customQuery<AuthenticatorRecord[]>(query =>
      query
        .select()
        .eq('aaguid', aaguid)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }

  /**
   * Find authenticators by device type
   * @param deviceType - The device type to find authenticators for
   * @returns Array of authenticators
   */
  async findByDeviceType(deviceType: string): Promise<AuthenticatorRecord[]> {
    const result = await this.customQuery<AuthenticatorRecord[]>(query =>
      query
        .select()
        .eq('credential_device_type', deviceType)
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }

  /**
   * Find authenticators by transport
   * @param transport - The transport to find authenticators for
   * @returns Array of authenticators
   */
  async findByTransport(transport: AuthenticatorTransportFuture): Promise<AuthenticatorRecord[]> {
    const result = await this.customQuery<AuthenticatorRecord[]>(query =>
      query
        .select()
        .contains('transports', [transport])
        .order('created_at', { ascending: false })
    );

    return result ? result.map(r => this.mapToRecord(r)) : [];
  }
} 