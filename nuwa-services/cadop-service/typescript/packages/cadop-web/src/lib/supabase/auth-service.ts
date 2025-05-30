import { supabase } from './config';
import type { UserSession } from '../auth/types';

export class SupabaseAuthService {
  /**
   * Create or update user with Passkey response
   */
  async handlePasskeyResponse(
    userId: string,
    email?: string
  ): Promise<UserSession> {
    // 1. Get or create user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw new Error(`Failed to get user profile: ${profileError.message}`);
    }

    if (!profile) {
      // Create new user profile
      const { data: newProfile, error: createError } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          email,
          created_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create user profile: ${createError.message}`);
      }

      return {
        id: newProfile.id,
        email: newProfile.email,
        did: newProfile.did,
        agent_did: newProfile.agent_did,
        sybil_level: newProfile.sybil_level,
        created_at: newProfile.created_at,
        last_sign_in_at: newProfile.last_sign_in_at,
      };
    }

    // 2. Update last sign in time
    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        last_sign_in_at: new Date().toISOString(),
        ...(email && { email }), // Update email if provided
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update user profile: ${updateError.message}`);
    }

    return {
      id: updatedProfile.id,
      email: updatedProfile.email,
      did: updatedProfile.did,
      agent_did: updatedProfile.agent_did,
      sybil_level: updatedProfile.sybil_level,
      created_at: updatedProfile.created_at,
      last_sign_in_at: updatedProfile.last_sign_in_at,
    };
  }

  /**
   * Update user DID information
   */
  async updateUserDID(
    userId: string,
    did: string,
    agentDid?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        did,
        ...(agentDid && { agent_did: agentDid }),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update user DID: ${error.message}`);
    }
  }

  /**
   * Update user Sybil level
   */
  async updateSybilLevel(
    userId: string,
    sybilLevel: number
  ): Promise<void> {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        sybil_level: sybilLevel,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to update Sybil level: ${error.message}`);
    }
  }

  /**
   * Get user session
   */
  async getUserSession(userId: string): Promise<UserSession | null> {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get user session: ${error.message}`);
    }

    return {
      id: profile.id,
      email: profile.email,
      did: profile.did,
      agent_did: profile.agent_did,
      sybil_level: profile.sybil_level,
      created_at: profile.created_at,
      last_sign_in_at: profile.last_sign_in_at,
    };
  }
} 