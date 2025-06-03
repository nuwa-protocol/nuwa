import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialDescriptorFuture,
  UserVerificationRequirement,
} from '@simplewebauthn/types';

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
} from '@cadop/shared';

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

type ResidentKeyRequirement = 'discouraged' | 'preferred' | 'required';

export class WebAuthnService {
  private config: WebAuthnConfig;

  constructor() {
    this.config = {
      rpName: process.env['WEBAUTHN_RP_NAME'] || 'CADOP Service',
      rpID: process.env['WEBAUTHN_RP_ID'] || 'localhost',
      origin: process.env['WEBAUTHN_ORIGIN'] || 'http://localhost:3000',
      timeout: parseInt(process.env['WEBAUTHN_CHALLENGE_TIMEOUT'] || '300000'), // 5 minutes
      attestationType: 'none',
    };
  }

  /**
   * Get user's registered WebAuthn devices
   */
  async getUserDevices(userId: string): Promise<WebAuthnDeviceInfo[]> {
    const authenticators = await this.getAuthenticators(userId);
    return authenticators.map(auth => ({
      id: auth.id,
      name: auth.friendly_name || 'Unknown Device',
      type: auth.credential_device_type,
      lastUsed: auth.last_used_at?.toISOString() || 'Never',
    }));
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
      
      const options = {
        rpName: this.config.rpName,
        rpID: this.config.rpID,
        userID: Buffer.from(userId),
        userName: userEmail,
        userDisplayName: userName || userEmail,
        timeout: this.config.timeout,
        attestationType: this.config.attestationType,
        excludeCredentials: existingAuthenticators.map(auth => ({
          id: Buffer.from(auth.credential_id).toString('base64'),
          type: 'public-key' as const,
          transports: auth.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred' as ResidentKeyRequirement,
          userVerification: 'preferred' as UserVerificationRequirement,
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      };

      const registrationOptions = await generateRegistrationOptions(options);

      // Store challenge in database
      await this.storeChallenge(userId, Buffer.from(registrationOptions.challenge, 'base64'), 'registration', {
        user_email: userEmail,
        user_name: userName,
      });

      logger.info('Generated WebAuthn registration options', {
        userId,
        challengeLength: registrationOptions.challenge.length,
        excludeCredentialsCount: registrationOptions.excludeCredentials?.length || 0,
      });

      return registrationOptions;
    } catch (error) {
      logger.error('Failed to generate registration options', { error, userId });
      throw new WebAuthnError(
        'Failed to generate registration options'
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
          'No valid registration challenge found'
        );
      }

      const opts = {
        response,
        expectedChallenge: challenge.challenge.toString('base64'),
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
      };

      const verification = await verifyRegistrationResponse(opts);

      if (!verification.verified || !verification.registrationInfo) {
        logger.warn('WebAuthn registration verification failed', {
          userId,
          verified: verification.verified,
        });
        throw new WebAuthnError(
          'Registration verification failed'
        );
      }

      // Create new authenticator record
      const { registrationInfo } = verification;
      const authenticatorData: CreateAuthenticatorData = {
        credentialId: Buffer.from(registrationInfo.credential.id).toString('base64'),
        credentialPublicKey: Buffer.from(registrationInfo.credential.publicKey),
        counter: 0,
        credentialDeviceType: registrationInfo.credentialDeviceType || 'singleDevice',
        credentialBackedUp: registrationInfo.credentialBackedUp || false,
        transports: response.response.transports || [],
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
          credential_id: authenticator.credential_id.toString('base64'),
          created_at: authenticator.created_at,
          transports: authenticator.transports,
        },
      };
    } catch (error: unknown) {
      logger.error('WebAuthn registration failed', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Registration verification failed'
      );
    }
  }

  /**
   * Generate authentication options for an existing WebAuthn credential
   */
  async generateAuthenticationOptions(
    userId?: string
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    try {
      const allowCredentials = userId
        ? (await this.getAuthenticators(userId)).map(auth => ({
            id: Buffer.from(auth.credential_id).toString('base64'),
            type: 'public-key' as const,
            transports: auth.transports,
          }))
        : undefined;

      const options = {
        timeout: this.config.timeout,
        allowCredentials,
        userVerification: 'preferred' as UserVerificationRequirement,
        rpID: this.config.rpID,
      };

      const authenticationOptions = await generateAuthenticationOptions(options);

      if (userId) {
        await this.storeChallenge(userId, Buffer.from(authenticationOptions.challenge, 'base64'), 'authentication', {});
      }

      return authenticationOptions;
    } catch (error) {
      logger.error('Failed to generate authentication options', { error, userId });
      throw new WebAuthnError(
        'Failed to generate authentication options'
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
      const authenticator = await this.getAuthenticatorByCredentialId(
        Buffer.from(response.id, 'base64')
      );

      if (!authenticator) {
        throw new WebAuthnError(
          'Authenticator not found',
          'AUTHENTICATOR_NOT_FOUND'
        );
      }

      const challenge = expectedChallenge
        ? Buffer.from(expectedChallenge)
        : await this.getAndConsumeChallenge(authenticator.user_id, 'authentication');

      if (!challenge) {
        throw new WebAuthnError(
          'Challenge not found or expired',
          'CHALLENGE_NOT_FOUND'
        );
      }

      const opts = {
        response,
        expectedChallenge: challenge.toString('base64'),
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        authenticator: {
          credentialID: authenticator.credential_id,
          credentialPublicKey: authenticator.credential_public_key,
          counter: authenticator.counter,
        },
        credential: {
          id: response.id,
          publicKey: authenticator.credential_public_key,
          counter: authenticator.counter,
        }
      };

      const verification = await verifyAuthenticationResponse(opts);

      if (!verification.verified) {
        logger.warn('WebAuthn authentication verification failed', {
          userId: authenticator.user_id,
          authenticatorId: authenticator.id,
        });
        throw new WebAuthnError(
          'Authentication verification failed'
        );
      }

      // Update authenticator counter and last used
      await this.updateAuthenticator(authenticator.id, {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
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
    } catch (error: unknown) {
      logger.error('WebAuthn authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof WebAuthnError) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: false,
        error: 'Authentication failed',
      };
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
        'REMOVE_DEVICE_FAILED'
      );
    }
  }

  // Private helper methods
  private async storeChallenge(
    userId: string,
    challenge: Buffer,
    operationType: 'registration' | 'authentication',
    clientData: Record<string, any> = {}
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.config.timeout);

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
        'Failed to store challenge'
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