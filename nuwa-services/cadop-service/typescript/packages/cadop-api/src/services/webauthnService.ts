import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialDescriptorJSON,
  UserVerificationRequirement,
} from '@simplewebauthn/types';

type ResidentKeyRequirement = 'discouraged' | 'preferred' | 'required';

import {
  WebAuthnError,
  WebAuthnConfig,
  Authenticator,
  WebAuthnChallenge,
  WebAuthnRegistrationResult,
  CreateAuthenticatorData,
  UpdateAuthenticatorData,
  WebAuthnDeviceInfo,
  WebAuthnAuthenticationResult,
} from '@cadop/shared';

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

// Base64URL 工具函数
function base64URLToBuffer(base64url: string): Buffer {
  // 1. 添加填充
  const base64 = base64url.padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  // 2. 转换回标准 base64 字符
  const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(standardBase64, 'base64');
}

function bufferToBase64URL(buffer: Buffer): string {
  // 1. 转换为标准 base64
  const base64 = buffer.toString('base64');
  // 2. 转换为 base64url 并移除填充
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

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

    logger.debug('WebAuthn service initialized with config', { config: this.config });
  }

  /**
   * Get user's registered WebAuthn devices
   */
  async getUserDevices(userId: string): Promise<WebAuthnDeviceInfo[]> {
    const authenticators = await this.getAuthenticators(userId);
    return authenticators.map(auth => ({
      id: auth.id,
      name: auth.friendlyName || 'Unknown Device',
      type: auth.credentialDeviceType,
      lastUsed: auth.lastUsedAt?.toISOString() || 'Never',
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
      logger.debug('Generating registration options', {
        userId,
        userEmail,
        userName,
        config: this.config,
      });

      // Get existing authenticators for this user to exclude them
      const existingAuthenticators = await this.getAuthenticators(userId);
      
      logger.debug('Found existing authenticators', {
        userId,
        authenticatorsCount: existingAuthenticators.length,
        authenticators: existingAuthenticators,
      });

      const options = await generateRegistrationOptions({
        rpName: this.config.rpName,
        rpID: this.config.rpID,
        userID: Buffer.from(userId),
        userName: userEmail,
        userDisplayName: userName || userEmail,
        timeout: this.config.timeout,
        attestationType: this.config.attestationType,
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
        excludeCredentials: existingAuthenticators.map(auth => ({
          id: auth.credentialId,
          type: 'public-key' as const,
          transports: auth.transports,
        })),
        authenticatorSelection: {
          residentKey: 'preferred' as ResidentKeyRequirement,
          userVerification: 'preferred' as UserVerificationRequirement,
        },
      });

      logger.debug('Generated registration options', { 
        options,
        challenge: options.challenge,
      });

      // Store challenge in database
      await this.storeChallenge(userId, options.challenge, 'registration', {
        email: userEmail,
        user_name: userName,
      });

      return options;
    } catch (error) {
      logger.error('Failed to generate registration options', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        userEmail,
      });
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
      logger.debug('Verifying registration response', {
        userId,
        response,
        friendlyName,
      });

      // Parse the client data to get the challenge
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, 'base64').toString('utf-8')
      );

      // Get and consume challenge
      const storedChallenge = await this.getAndConsumeChallenge(userId, 'registration');
      if (!storedChallenge) {
        logger.warn('No valid registration challenge found', { userId });
        throw new WebAuthnError(
          'No valid registration challenge found'
        );
      }

      logger.debug('Challenge verification', {
        receivedChallenge: clientDataJSON.challenge,
        storedChallenge: storedChallenge.challenge,
      });

      // Verify the registration response first
      const opts = {
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
      };

      logger.debug('Calling verifyRegistrationResponse with options', { opts });

      const verification = await verifyRegistrationResponse(opts);

      logger.debug('Verification result', { verification });

      if (!verification.verified || !verification.registrationInfo) {
        logger.warn('WebAuthn registration verification failed', {
          userId,
          verified: verification.verified,
          registrationInfo: verification.registrationInfo,
        });
        throw new WebAuthnError(
          'Registration verification failed'
        );
      }

      // After challenge verification, check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        logger.warn('User not found, creating new user', { userId });
        
        // Create user if not exists
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: storedChallenge.email,
            user_did: `did:rooch:${userId}`, // Generate DID for user
          })
          .select()
          .single();

        if (createError) {
          logger.error('Failed to create user', { error: createError });
          throw new WebAuthnError('Failed to create user');
        }

        logger.info('Created new user', { userId, email: storedChallenge.email });
      }

      // Create new authenticator record
      const { registrationInfo } = verification;
      
      logger.debug('Registration info details', {
        credentialId: registrationInfo.credential.id,
        publicKeyLength: registrationInfo.credential.publicKey.length,
        publicKeyType: typeof registrationInfo.credential.publicKey,
        publicKeyBuffer: Buffer.isBuffer(registrationInfo.credential.publicKey),
        publicKeyContent: registrationInfo.credential.publicKey,
      });

      // 将类数组对象转换为真正的数组，然后创建 Buffer
      const publicKeyArray = Array.from(registrationInfo.credential.publicKey);
      const publicKeyBuffer = Buffer.from(publicKeyArray);

      logger.debug('Converted public key', {
        publicKeyArray: publicKeyArray,
        publicKeyBufferHex: publicKeyBuffer.toString('hex'),
      });

      const authenticatorData: CreateAuthenticatorData = {
        credentialId: registrationInfo.credential.id,
        credentialPublicKey: publicKeyBuffer,
        counter: 0,
        credentialDeviceType: registrationInfo.credentialDeviceType || 'singleDevice',
        credentialBackedUp: registrationInfo.credentialBackedUp || false,
        transports: response.response.transports || [],
      };

      logger.debug('Creating new authenticator', { 
        credentialId: authenticatorData.credentialId,
        publicKeyLength: authenticatorData.credentialPublicKey.length,
        publicKeyBuffer: Buffer.isBuffer(authenticatorData.credentialPublicKey),
        publicKeyHex: authenticatorData.credentialPublicKey.toString('hex'),
      });

      const authenticator = await this.createAuthenticator({
        userId,
        ...authenticatorData,
      });

      logger.debug('Created new authenticator', { 
        id: authenticator.id,
        credentialId: authenticator.credentialId,
        createdAt: authenticator.createdAt,
        transports: authenticator.transports,
      });

      return {
        success: true,
        authenticator: {
          id: authenticator.id,
          ...(friendlyName ? { friendlyName } : {}),
          credentialId: authenticator.credentialId,
          createdAt: authenticator.createdAt,
          transports: authenticator.transports,
        },
      };
    } catch (error) {
      logger.error('Failed to verify registration response', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        response,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration verification failed',
        details: error,
      };
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
            id: auth.credentialId,
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

      // 总是存储 challenge，对于匿名用户使用 'anonymous' 作为 userId
      await this.storeChallenge(userId || 'anonymous', authenticationOptions.challenge, 'authentication', {});

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
      const authenticator = await this.getAuthenticatorByCredentialId(response.id);

      if (!authenticator) {
        throw new WebAuthnError(
          `Authenticator not found via credentialId(${response.id})`,
          'AUTHENTICATOR_NOT_FOUND'
        );
      }

      let challengeStr: string;
      if (expectedChallenge) {
        challengeStr = expectedChallenge;
      } else {
        // 对于匿名认证流程，先尝试查找匿名 challenge
        let challenge = await this.getAndConsumeChallenge(null, 'authentication');
        
        // 如果没找到匿名 challenge，再尝试使用用户特定的 challenge
        if (!challenge && authenticator.userId) {
          challenge = await this.getAndConsumeChallenge(authenticator.userId, 'authentication');
        }

        if (!challenge) {
          throw new WebAuthnError(
            `Challenge not found or expired for authenticator(${response.id})`,
            'CHALLENGE_NOT_FOUND'
          );
        }
        challengeStr = challenge.challenge;
      }

      // 确保 publicKey 是正确的格式：从十六进制字符串转换为 Uint8Array
      const publicKeyHex = String(authenticator.credentialPublicKey);
      const bytes: number[] = [];
      for (let i = 0; i < publicKeyHex.length; i += 2) {
        bytes.push(parseInt(publicKeyHex.slice(i, i + 2), 16));
      }
      const publicKey = new Uint8Array(bytes);

      const opts = {
        response,
        expectedChallenge: challengeStr,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        credential: {
          id: authenticator.credentialId,
          publicKey,
          counter: authenticator.counter,
        },
        requireUserVerification: false,
      };

      logger.debug('Verifying authentication response with options', { 
        credentialId: authenticator.credentialId,
        publicKeyHex,
      });

      let verification: VerifiedAuthenticationResponse;
      try {
        verification = await verifyAuthenticationResponse(opts);
        logger.debug('Verification result', { verification });
        if (!verification.verified) {
          logger.warn('WebAuthn authentication verification failed', {
            userId: authenticator.userId,
            authenticatorId: authenticator.id,
          });
          throw new WebAuthnError(
            'Authentication verification failed'
          );
        }
      } catch (error) {
        logger.error('Failed to verify authentication response', { 
          error, 
          opts,
          publicKeyType: typeof publicKey,
          publicKeyIsBuffer: Buffer.isBuffer(publicKey),
          publicKeyHex: publicKey.toString('hex'),
        });
        throw new WebAuthnError(
          'Failed to verify authentication response'
        );
      }      

      // Update authenticator counter and last used
      await this.updateAuthenticator(authenticator.id, {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      });

      logger.info('WebAuthn authentication successful', {
        userId: authenticator.userId,
        authenticatorId: authenticator.id,
      });

      return {
        success: true,
        userId: authenticator.userId,
        authenticatorId: authenticator.id
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
    challenge: string,
    operationType: 'registration' | 'authentication',
    clientData: Record<string, any> = {}
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.config.timeout);
    
    logger.debug('Storing challenge', {
      userId,
      challenge,
      operationType,
      clientData,
      expiresAt,
    });

    // 直接存储 base64url 字符串
    const { error } = await supabase
      .from('webauthn_challenges')
      .insert({
        user_id: userId === 'anonymous' ? null : userId,  // 如果是匿名用户，存储 null
        challenge: challenge,
        operation_type: operationType,
        client_data: clientData,
        expires_at: expiresAt,
      });

    if (error) {
      logger.error('Failed to store challenge', { error, userId, challenge });
      throw new WebAuthnError(
        'Failed to store challenge'
      );
    }

    logger.debug('Challenge stored successfully', {
      userId,
      challenge,
      operationType,
      expiresAt,
    });
  }

  private async getAndConsumeChallenge(
    userId: string | null,
    operationType: 'registration' | 'authentication'
  ): Promise<{ user_id: string | null; email: string; challenge: string } | null> {
    // 构建基本查询
    let query = supabase
      .from('webauthn_challenges')
      .select('*')
      .eq('operation_type', operationType)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    // 如果提供了 userId 且不是 anonymous，添加 user_id 条件
    if (userId && userId !== 'anonymous') {
      query = query.eq('user_id', userId);
    } else {
      // 对于匿名用户，查找 user_id 为 null 的记录
      query = query.is('user_id', null);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      logger.warn('Challenge not found', { 
        userId,
        operationType,
        error 
      });
      return null;
    }

    // Mark challenge as used
    await supabase
      .from('webauthn_challenges')
      .update({ used_at: new Date() })
      .eq('id', data.id);

    return {
      user_id: data.user_id,
      email: data.client_data.email,
      challenge: data.challenge,
    };
  }

  private async getAuthenticators(userId: string): Promise<Authenticator[]> {
    const { data, error } = await supabase
      .from('authenticators')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return data.map(auth => ({
      id: auth.id,
      userId: auth.user_id,
      credentialId: auth.credential_id,
      credentialPublicKey: Buffer.from(auth.credential_public_key),
      counter: auth.counter,
      credentialDeviceType: auth.credential_device_type,
      credentialBackedUp: auth.credential_backed_up,
      transports: auth.transports,
      friendlyName: auth.friendly_name,
      aaguid: auth.aaguid,
      lastUsedAt: auth.last_used_at ? new Date(auth.last_used_at) : undefined,
      createdAt: new Date(auth.created_at),
      updatedAt: new Date(auth.updated_at),
    }));
  }

  private async getAuthenticatorByCredentialId(credentialId: string): Promise<Authenticator | null> {
    const { data, error } = await supabase
      .from('authenticators')
      .select('*')
      .eq('credential_id', credentialId)
      .single();

    if (error || !data) return null;

    // 处理从数据库读取的 credential_public_key
    let publicKey = data.credential_public_key;
    
    logger.debug('Raw public key from database', {
      publicKeyType: typeof publicKey,
      publicKeyLength: publicKey.length,
      isHexString: typeof publicKey === 'string' && /^[0-9a-fA-F]*$/.test(publicKey),
    });

    // 从十六进制字符串转换为 Buffer
    publicKey = Buffer.from(publicKey, 'hex');

    logger.debug('Processed public key', {
      credentialId,
      publicKeyLength: publicKey.length,
      publicKeyType: typeof publicKey,
      publicKeyBuffer: Buffer.isBuffer(publicKey),
      publicKeyHex: publicKey.toString('hex'),
      service: 'cadop-service',
      timestamp: new Date().toISOString(),
    });

    return {
      id: data.id,
      userId: data.user_id,
      credentialId: data.credential_id,
      credentialPublicKey: publicKey,
      counter: data.counter,
      credentialDeviceType: data.credential_device_type,
      credentialBackedUp: data.credential_backed_up,
      transports: data.transports,
      friendlyName: data.friendly_name,
      aaguid: data.aaguid,
      lastUsedAt: data.last_used_at ? new Date(data.last_used_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private async createAuthenticator(data: {
    userId: string;
    credentialId: string;
    credentialPublicKey: Buffer | Uint8Array;
    counter: number;
    credentialDeviceType: string;
    credentialBackedUp: boolean;
    transports?: AuthenticatorTransportFuture[];
  }): Promise<Authenticator> {
    // 确保 credentialPublicKey 是 Buffer 或 Uint8Array
    if (!Buffer.isBuffer(data.credentialPublicKey) && !(data.credentialPublicKey instanceof Uint8Array)) {
      throw new Error('credentialPublicKey must be a Buffer or Uint8Array');
    }

    // 转换为十六进制字符串存储
    const publicKeyHex = Buffer.from(data.credentialPublicKey).toString('hex');

    const dbData = {
      user_id: data.userId,
      credential_id: data.credentialId,
      credential_public_key: publicKeyHex,
      counter: data.counter,
      credential_device_type: data.credentialDeviceType,
      credential_backed_up: data.credentialBackedUp,
      transports: data.transports,
    };

    logger.debug('Creating authenticator in database', {
      userId: data.userId,
      credentialId: data.credentialId,
      publicKeyLength: publicKeyHex.length / 2,
      publicKeyType: 'hex',
      publicKeyHex,
    });

    const { data: result, error } = await supabase
      .from('authenticators')
      .insert(dbData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create authenticator', {
        error,
        userId: data.userId,
        credentialId: data.credentialId,
      });
      throw error;
    }

    // 从十六进制字符串转回 Buffer
    const publicKey = Buffer.from(result.credential_public_key, 'hex');

    return {
      id: result.id,
      userId: result.user_id,
      credentialId: result.credential_id,
      credentialPublicKey: publicKey,
      counter: result.counter,
      credentialDeviceType: result.credential_device_type,
      credentialBackedUp: result.credential_backed_up,
      transports: result.transports,
      friendlyName: result.friendly_name,
      aaguid: result.aaguid,
      lastUsedAt: result.last_used_at ? new Date(result.last_used_at) : undefined,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
    };
  }

  private async updateAuthenticator(
    id: string,
    data: UpdateAuthenticatorData
  ): Promise<void> {
    logger.debug('Updating authenticator', { id, data });
    const dbData = {
      counter: data.counter,
      last_used_at: data.lastUsedAt,
    };
    const { error } = await supabase
      .from('authenticators')
      .update(dbData)
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

  /**
   * Get challenge by challenge string
   */
  async getChallenge(challenge: string): Promise<{ user_id: string; email: string; challenge: Buffer } | null> {
    try {
      logger.debug('Looking up challenge', {
        originalChallenge: challenge,
      });

      const { data, error } = await supabase
        .from('webauthn_challenges')
        .select('user_id, challenge, client_data')
        .eq('challenge', challenge)  // 直接使用 base64url 字符串进行比较
        .single();

      if (error || !data) {
        logger.warn('Challenge not found', { 
          challenge,
          error 
        });
        return null;
      }

      return {
        user_id: data.user_id,
        email: data.client_data.email,
        challenge: base64URLToBuffer(data.challenge),  // 只在需要 Buffer 时转换
      };
    } catch (error) {
      logger.error('Failed to get challenge', { error, challenge });
      return null;
    }
  }

  async updateAuthenticatorUsage(result: WebAuthnAuthenticationResult): Promise<void> {
    if (!result.success || !result.authenticatorId) {
      return;
    }

    // 从验证结果中获取 counter
    const { data: authenticator } = await supabase
      .from('authenticators')
      .select('counter')
      .eq('id', result.authenticatorId)
      .single();

    const { error } = await supabase
      .from('authenticators')
      .update({
        last_used_at: new Date(),
        counter: (authenticator?.counter || 0) + 1
      })
      .eq('id', result.authenticatorId);

    if (error) {
      logger.error('Failed to update authenticator usage', {
        error,
        authenticatorId: result.authenticatorId
      });
      throw new Error('Failed to update authenticator usage');
    }
  }
}

export const webauthnService = new WebAuthnService(); 