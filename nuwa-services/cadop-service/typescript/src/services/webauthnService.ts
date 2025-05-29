import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialDescriptorFuture,
} from '@simplewebauthn/types';

import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import {
  WebAuthnError,
  WebAuthnConfig,
  Authenticator,
  WebAuthnChallenge,
  WebAuthnRegistrationResult,
  WebAuthnAuthenticationResult,
  CreateAuthenticatorData,
  UpdateAuthenticatorData,
  WebAuthnDeviceInfo,
} from '../types/webauthn';

export class WebAuthnService {
  private config: WebAuthnConfig;

  constructor() {
    this.config = {
      rp_name: process.env['WEBAUTHN_RP_NAME'] || 'CADOP Service',
      rp_id: process.env['WEBAUTHN_RP_ID'] || 'localhost',
      origin: process.env['WEBAUTHN_ORIGIN'] || 'http://localhost:3000',
      challenge_timeout: parseInt(process.env['WEBAUTHN_CHALLENGE_TIMEOUT'] || '300000'), // 5 minutes
      expected_origin: process.env['WEBAUTHN_EXPECTED_ORIGIN'] || 'http://localhost:3000',
      expected_rp_id: process.env['WEBAUTHN_EXPECTED_RP_ID'] || 'localhost',
    };
  }

  /**
   * Generate registration options for a new WebAuthn credential
   */
  async generateRegistrationOptions(
    userId: string,
    userEmail: string,
    userName?: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    try {
      // Get existing authenticators for this user to exclude them
      const existingAuthenticators = await this.getAuthenticators(userId);
      
      const options: GenerateRegistrationOptionsOpts = {
        rpName: this.config.rp_name,
        rpID: this.config.rp_id,
        userID: userId,
        userName: userEmail,
        userDisplayName: userName || userEmail,
        timeout: this.config.challenge_timeout,
        attestationType: 'none',
        excludeCredentials: existingAuthenticators.map(auth => ({
          id: auth.credential_id,
          type: 'public-key',
          transports: auth.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      };

      const registrationOptions = await generateRegistrationOptions(options);

      // Store challenge in database
      await this.storeChallenge(
        userId,
        Buffer.from(registrationOptions.challenge, 'base64url'),
        'registration',
        {
          user_email: userEmail,
          user_name: userName,
        }
      );

      logger.info('Generated WebAuthn registration options', {
        userId,
        challengeLength: registrationOptions.challenge.length,
        excludeCredentialsCount: registrationOptions.excludeCredentials?.length || 0,
      });

      return registrationOptions;
    } catch (error) {
      logger.error('Failed to generate registration options', { error, userId });
      throw new WebAuthnError(
        'Failed to generate registration options',
        'REGISTRATION_OPTIONS_FAILED',
        error
      );
    }
  }

  /**
   * Verify registration response and create new authenticator
   */
  async verifyRegistrationResponse(
    userId: string,
    response: RegistrationResponseJSON,
    friendlyName?: string
  ): Promise<WebAuthnRegistrationResult> {
    try {
      // Get and consume challenge
      const challenge = await this.getAndConsumeChallenge(userId, 'registration');
      if (!challenge) {
        throw new WebAuthnError(
          'No valid registration challenge found',
          'CHALLENGE_NOT_FOUND'
        );
      }

      const opts: VerifyRegistrationResponseOpts = {
        response,
        expectedChallenge: challenge.challenge.toString('base64url'),
        expectedOrigin: this.config.expected_origin,
        expectedRPID: this.config.expected_rp_id,
      };

      const verification = await verifyRegistrationResponse(opts);

      if (!verification.verified || !verification.registrationInfo) {
        logger.warn('WebAuthn registration verification failed', {
          userId,
          verified: verification.verified,
        });
        throw new WebAuthnError(
          'Registration verification failed',
          'VERIFICATION_FAILED',
          verification
        );
      }

      // Create new authenticator record
      const { registrationInfo } = verification;
      const authenticatorData: CreateAuthenticatorData = {
        user_id: userId,
        credential_id: Buffer.from(registrationInfo.credentialID),
        credential_public_key: Buffer.from(registrationInfo.credentialPublicKey),
        counter: registrationInfo.counter,
        credential_device_type: registrationInfo.credentialDeviceType,
        credential_backed_up: registrationInfo.credentialBackedUp,
        transports: response.response.transports || [],
        ...(friendlyName ? { friendly_name: friendlyName } : {}),
        aaguid: registrationInfo.aaguid,
      };

      const authenticator = await this.createAuthenticator(authenticatorData);

      // Update auth_methods table to include this WebAuthn credential
      await this.updateAuthMethod(userId, {
        provider: 'webauthn',
        provider_user_id: authenticator.id,
        provider_data: {
          authenticator_id: authenticator.id,
          friendly_name: friendlyName,
          transports: response.response.transports,
        },
        sybil_contribution: 25, // WebAuthn provides good Sybil resistance
        verified_at: new Date(),
      });

      logger.info('WebAuthn registration successful', {
        userId,
        authenticatorId: authenticator.id,
        friendlyName,
      });

      return {
        success: true,
        authenticator: {
          id: authenticator.id,
          ...(friendlyName ? { friendly_name: friendlyName } : {}),
          credential_id: authenticator.credential_id.toString('base64url'),
          created_at: authenticator.created_at,
          transports: authenticator.transports,
        },
      };
    } catch (error) {
      logger.error('WebAuthn registration failed', { error, userId });
      
      if (error instanceof WebAuthnError) {
        return {
          success: false,
          error: error.message,
          details: error.details,
        };
      }

      return {
        success: false,
        error: 'Registration failed',
        details: error,
      };
    }
  }

  /**
   * Generate authentication options
   */
  async generateAuthenticationOptions(
    userId?: string
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    try {
      logger.info('Generating WebAuthn authentication options', { userId });

      let allowCredentials: PublicKeyCredentialDescriptorFuture[] | undefined;

      if (userId) {
        const authenticators = await this.getAuthenticators(userId);
        allowCredentials = authenticators.map(auth => ({
          id: auth.credential_id,
          type: 'public-key' as const,
          transports: auth.transports,
        }));
      }

      const options: GenerateAuthenticationOptionsOpts = {
        timeout: this.config.challenge_timeout,
        userVerification: 'preferred',
        rpID: this.config.rp_id,
        ...(allowCredentials && { allowCredentials }),
      };

      const authenticationOptions = await generateAuthenticationOptions(options);

      // Store challenge
      await this.storeChallenge(
        userId || null,
        Buffer.from(authenticationOptions.challenge, 'base64url'),
        'authentication',
        { allow_credentials_count: allowCredentials?.length || 0 }
      );

      logger.info('Generated WebAuthn authentication options', {
        userId,
        challengeLength: authenticationOptions.challenge.length,
        allowCredentialsCount: allowCredentials?.length || 0,
      });

      return authenticationOptions;
    } catch (error) {
      logger.error('Failed to generate authentication options', { error, userId });
      throw new WebAuthnError(
        'Failed to generate authentication options',
        'AUTHENTICATION_OPTIONS_FAILED',
        error
      );
    }
  }

  /**
   * Verify authentication response
   */
  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
    expectedChallenge?: string
  ): Promise<WebAuthnAuthenticationResult> {
    try {
      // Get authenticator by credential ID
      const authenticator = await this.getAuthenticatorByCredentialId(
        Buffer.from(response.id, 'base64url')
      );
      
      if (!authenticator) {
        throw new WebAuthnError(
          'Authenticator not found',
          'AUTHENTICATOR_NOT_FOUND'
        );
      }

      // Get and consume challenge
      let challenge;
      if (expectedChallenge) {
        challenge = { challenge: Buffer.from(expectedChallenge, 'base64url') };
      } else {
        challenge = await this.getAndConsumeChallenge(
          authenticator.user_id,
          'authentication'
        );
      }

      if (!challenge) {
        throw new WebAuthnError(
          'No valid authentication challenge found',
          'CHALLENGE_NOT_FOUND'
        );
      }

      const opts: VerifyAuthenticationResponseOpts = {
        response,
        expectedChallenge: challenge.challenge.toString('base64url'),
        expectedOrigin: this.config.expected_origin,
        expectedRPID: this.config.expected_rp_id,
        authenticator: {
          credentialID: authenticator.credential_id,
          credentialPublicKey: authenticator.credential_public_key,
          counter: authenticator.counter,
          transports: authenticator.transports,
        },
      };

      const verification = await verifyAuthenticationResponse(opts);

      if (!verification.verified) {
        logger.warn('WebAuthn authentication verification failed', {
          userId: authenticator.user_id,
          authenticatorId: authenticator.id,
        });
        throw new WebAuthnError(
          'Authentication verification failed',
          'VERIFICATION_FAILED',
          verification
        );
      }

      // Update authenticator counter and last used
      await this.updateAuthenticator(authenticator.id, {
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date(),
      });

      logger.info('WebAuthn authentication successful', {
        userId: authenticator.user_id,
        authenticatorId: authenticator.id,
      });

      return {
        success: true,
        user_id: authenticator.user_id,
        authenticator_id: authenticator.id,
      };
    } catch (error) {
      logger.error('WebAuthn authentication failed', { error });

      if (error instanceof WebAuthnError) {
        return {
          success: false,
          error: error.message,
          details: error.details,
        };
      }

      return {
        success: false,
        error: 'Authentication failed',
        details: error,
      };
    }
  }

  /**
   * Get user's authenticators/devices
   */
  async getUserDevices(userId: string): Promise<WebAuthnDeviceInfo[]> {
    try {
      const { data, error } = await supabase
        .from('authenticators')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(auth => ({
        id: auth.id,
        friendly_name: auth.friendly_name,
        created_at: new Date(auth.created_at),
        last_used_at: auth.last_used_at ? new Date(auth.last_used_at) : undefined,
        transports: auth.transports || [],
        device_type: auth.credential_device_type,
        backed_up: auth.credential_backed_up,
      }));
    } catch (error) {
      logger.error('Failed to get user devices', { error, userId });
      throw new WebAuthnError(
        'Failed to get user devices',
        'GET_DEVICES_FAILED',
        error
      );
    }
  }

  /**
   * Remove a user's authenticator
   */
  async removeDevice(userId: string, authenticatorId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('authenticators')
        .delete()
        .eq('id', authenticatorId)
        .eq('user_id', userId);

      if (error) throw error;

      // Also remove from auth_methods if it exists
      await supabase
        .from('auth_methods')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'webauthn')
        .eq('provider_user_id', authenticatorId);

      logger.info('WebAuthn device removed', { userId, authenticatorId });
      return true;
    } catch (error) {
      logger.error('Failed to remove device', { error, userId, authenticatorId });
      throw new WebAuthnError(
        'Failed to remove device',
        'REMOVE_DEVICE_FAILED',
        error
      );
    }
  }

  // Private helper methods
  private async storeChallenge(
    userId: string | null,
    challenge: Buffer,
    operationType: 'registration' | 'authentication',
    clientData: Record<string, any> = {}
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.config.challenge_timeout);

    const { error } = await supabase
      .from('webauthn_challenges')
      .insert({
        user_id: userId,
        challenge,
        operation_type: operationType,
        client_data: clientData,
        expires_at: expiresAt,
      });

    if (error) {
      throw new WebAuthnError(
        'Failed to store challenge',
        'STORE_CHALLENGE_FAILED',
        error
      );
    }
  }

  private async getAndConsumeChallenge(
    userId: string,
    operationType: 'registration' | 'authentication'
  ): Promise<WebAuthnChallenge | null> {
    const { data, error } = await supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', userId)
      .eq('operation_type', operationType)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Mark challenge as used
    await supabase
      .from('webauthn_challenges')
      .update({ used_at: new Date() })
      .eq('id', data.id);

    return {
      ...data,
      challenge: Buffer.from(data.challenge),
      expires_at: new Date(data.expires_at),
      used_at: data.used_at ? new Date(data.used_at) : undefined,
      created_at: new Date(data.created_at),
    };
  }

  private async getAuthenticators(userId: string): Promise<Authenticator[]> {
    const { data, error } = await supabase
      .from('authenticators')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return data.map(auth => ({
      ...auth,
      credential_id: Buffer.from(auth.credential_id),
      credential_public_key: Buffer.from(auth.credential_public_key),
      created_at: new Date(auth.created_at),
      updated_at: new Date(auth.updated_at),
      last_used_at: auth.last_used_at ? new Date(auth.last_used_at) : undefined,
    }));
  }

  private async getAuthenticatorByCredentialId(credentialId: Buffer): Promise<Authenticator | null> {
    const { data, error } = await supabase
      .from('authenticators')
      .select('*')
      .eq('credential_id', credentialId)
      .single();

    if (error || !data) return null;

    return {
      ...data,
      credential_id: Buffer.from(data.credential_id),
      credential_public_key: Buffer.from(data.credential_public_key),
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      last_used_at: data.last_used_at ? new Date(data.last_used_at) : undefined,
    };
  }

  private async createAuthenticator(data: CreateAuthenticatorData): Promise<Authenticator> {
    const { data: result, error } = await supabase
      .from('authenticators')
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    return {
      ...result,
      credential_id: Buffer.from(result.credential_id),
      credential_public_key: Buffer.from(result.credential_public_key),
      created_at: new Date(result.created_at),
      updated_at: new Date(result.updated_at),
      last_used_at: result.last_used_at ? new Date(result.last_used_at) : undefined,
    };
  }

  private async updateAuthenticator(
    id: string,
    data: UpdateAuthenticatorData
  ): Promise<void> {
    const { error } = await supabase
      .from('authenticators')
      .update(data)
      .eq('id', id);

    if (error) throw error;
  }

  private async updateAuthMethod(
    userId: string,
    data: {
      provider: string;
      provider_user_id: string;
      provider_data: Record<string, any>;
      sybil_contribution: number;
      verified_at: Date;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('auth_methods')
      .upsert({
        user_id: userId,
        ...data,
      });

    if (error) throw error;
  }

  /**
   * Cleanup expired challenges (called periodically)
   */
  async cleanupExpiredChallenges(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_expired_webauthn_challenges');
      
      if (error) throw error;
      
      logger.info('Cleaned up expired WebAuthn challenges', { count: data });
      return data || 0;
    } catch (error) {
      logger.error('Failed to cleanup expired challenges', { error });
      return 0;
    }
  }
}

export const webauthnService = new WebAuthnService(); 