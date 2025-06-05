import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

import {
  WebAuthnError,
  WebAuthnErrorCode,
  AuthenticationOptions,
  AuthenticationResult,
  Authenticator,
  WebAuthnConfig,
  CreateAuthenticatorData,
  UpdateAuthenticatorData,
  CredentialInfo,
  Session,
  DIDKeyManager,
  WebAuthnDeviceInfo,
  WebAuthnRegistrationResult,
} from '@cadop/shared';

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { DatabaseService } from './database.js';
import { mapToSession, SessionService } from './sessionService.js';
import crypto from 'crypto';
import { decode } from 'cbor2';

// Challenge 数据类型定义
interface ChallengeData {
  user_id: string | null;
  challenge: string;
  operation_type: 'registration' | 'authentication';
  client_data: Record<string, any>;
}

// Base64URL 工具函数
function base64URLToBuffer(base64url: string): Buffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64url.length + ((4 - base64url.length % 4) % 4), '=');
  return Buffer.from(base64, 'base64');
}

function bufferToBase64URL(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// 认证器响应类型
type AuthenticatorResponse = RegistrationResponseJSON | AuthenticationResponseJSON;

export class WebAuthnService {
  private config: WebAuthnConfig;
  private sessionService: SessionService;

  constructor() {
    this.config = {
      rpName: process.env['WEBAUTHN_RP_NAME'] || 'CADOP Service',
      rpID: process.env['WEBAUTHN_RP_ID'] || 'localhost',
      origin: process.env['WEBAUTHN_ORIGIN'] || 'http://localhost:3000',
      timeout: parseInt(process.env['WEBAUTHN_CHALLENGE_TIMEOUT'] || '300000'),
      attestationType: 'none',
    };
    this.sessionService = new SessionService();
    logger.debug('WebAuthn service initialized with config', { config: this.config });
  }

  /**
   * Get user's registered WebAuthn devices
   */
  async getUserDevices(userId: string): Promise<WebAuthnDeviceInfo[]> {
    const authenticators = await this.getAuthenticators({ userId });

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

      // Get existing authenticators for this user
      const existingAuthenticators = await this.getAuthenticators({ userId });
      
      logger.debug('Found existing authenticators', {
        userId,
        authenticatorsCount: existingAuthenticators?.length || 0,
        authenticators: existingAuthenticators,
      });

      const options = await generateRegistrationOptions({
        rpName: this.config.rpName,
        rpID: this.config.rpID,
        userID: Buffer.from(userId),  // 需要转换为 Buffer
        userName: userEmail,
        userDisplayName: userName || userEmail,
        timeout: this.config.timeout,
        attestationType: this.config.attestationType,
        supportedAlgorithmIDs: [-8], // EdDSA (Ed25519)
        excludeCredentials: existingAuthenticators?.map(auth => ({
          id: auth.credentialId,
          type: 'public-key' as const,
          transports: auth.transports,
        })) || [],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
      });

      logger.debug('Generated registration options', { 
        options,
        challenge: options.challenge,
        userId,
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
        'Failed to generate registration options',
        WebAuthnErrorCode.INTERNAL_ERROR,
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
          'No valid registration challenge found',
          WebAuthnErrorCode.INVALID_CHALLENGE
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
          'Registration verification failed',
          WebAuthnErrorCode.AUTHENTICATION_FAILED
        );
      }

      const { registrationInfo } = verification;

      // 检查现有的凭证
      const existingAuthenticator = await this.getAuthenticatorByCredentialId(response.id);

      if (existingAuthenticator) {
        logger.warn('Authenticator already registered', {
          userId,
          credentialId: response.id,
        });
        return {
          success: false,
          error: 'Authenticator already registered',
        };
      }

      // 确保公钥是正确的格式
      const publicKeyBuffer = Buffer.from(registrationInfo.credential.publicKey);

      const authenticatorData = {
        userId,
        credentialId: response.id,
        credentialPublicKey: publicKeyBuffer,
        counter: registrationInfo.credential.counter,
        credentialDeviceType: registrationInfo.credentialDeviceType || 'singleDevice',
        credentialBackedUp: registrationInfo.credentialBackedUp || false,
        transports: response.response.transports || [],
        friendlyName: friendlyName || 'Default Device'
      };

      logger.debug('Creating new authenticator', { 
        credentialId: authenticatorData.credentialId,
        publicKeyLength: authenticatorData.credentialPublicKey.length,
        publicKeyBuffer: Buffer.isBuffer(authenticatorData.credentialPublicKey),
        publicKeyHex: authenticatorData.credentialPublicKey.toString('hex'),
        userId,
        transports: authenticatorData.transports
      });

      const authenticator = await this.createAuthenticator(authenticatorData);

      logger.debug('Created new authenticator', { 
        id: authenticator.id,
        credentialId: authenticator.credentialId,
        createdAt: authenticator.createdAt,
        transports: authenticator.transports,
        userId: authenticator.userId
      });

      // 验证认证器是否正确创建
      const createdAuthenticator = await this.getAuthenticators({ id: authenticator.id });
      
      if (!createdAuthenticator) {
        logger.error('Failed to verify created authenticator', {
          authenticatorId: authenticator.id,
          userId
        });
        throw new Error('Failed to verify created authenticator');
      }

      logger.info('Successfully verified created authenticator', {
        authenticatorId: authenticator.id,
        credentialId: authenticator.credentialId,
        userId
      });

      return {
        success: true,
        authenticator: {
          id: authenticator.id,
          friendlyName: authenticator.friendlyName,
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
   * 统一的认证选项生成方法
   */
  async generateAuthenticationOptions(
    userDid?: string,
    userInfo?: { name?: string; displayName?: string }
  ): Promise<AuthenticationOptions> {
    try {
      logger.debug('Generating authentication options', {
        userDid,
        userInfo,
        config: this.config
      });

      let userId: string;
      let isNewUser = false;

      if (userDid) {
        logger.debug('User DID provided, looking up existing user', { userDid });
        // 查找或创建用户
        const user = await DatabaseService.getUserByDID(userDid);
        if (user) {
          userId = user.id;
          logger.debug('Found existing user', { userId, userDid });
        } else {
          logger.debug('User not found, creating new user', { userDid });
          const newUser = await DatabaseService.createUser({
            user_did: userDid,
            display_name: userInfo?.displayName || userDid,
            sybil_level: 0,
            metadata: {}
          });
          userId = newUser.id;
          isNewUser = true;
          logger.debug('Created new user', { userId, userDid, displayName: newUser.display_name });
        }
      } else {
        // 如果没有提供 DID，说明是首次使用，创建临时用户
        logger.debug('No DID provided, creating temporary user for registration');
        
        // 生成临时用户 ID 和临时 DID
        const tempUserId = crypto.randomUUID();
        const tempDid = `did:temp:${tempUserId}`;
        
        // 创建临时用户记录
        const tempUser = await DatabaseService.createUser({
          user_did: tempDid,
          display_name: userInfo?.displayName || 'New User',
          sybil_level: 0,
          metadata: {
            is_temporary: true,
            created_at: new Date().toISOString()
          }
        });

        userId = tempUser.id;
        isNewUser = true;
        
        logger.debug('Created temporary user', { 
          userId: tempUser.id,
          displayName: tempUser.display_name,
          did: tempDid
        });
      }

      if (isNewUser) {
        logger.debug('Generating registration options for new user', { userId, isNewUser });
        
        const authenticatorSelection: AuthenticatorSelectionCriteria = {
          // prefer platform authenticator(Touch ID/Face ID)
          authenticatorAttachment: 'platform',
          requireResidentKey: true,
          residentKey: 'required',
          userVerification: 'preferred'
        };

        // 生成注册选项
        const options = await generateRegistrationOptions({
          rpName: this.config.rpName,
          rpID: this.config.rpID,
          userID: Buffer.from(userId),
          userName: userInfo?.name || userDid || userId,
          userDisplayName: userInfo?.displayName || userInfo?.name || userDid || userId,
          attestationType: this.config.attestationType,
          authenticatorSelection: authenticatorSelection,
          // only support EdDSA (Ed25519) and ES256 (ECDSA)
          supportedAlgorithmIDs: [-8, -7],
        });

        logger.debug('Generated registration options', options);

        // 存储 challenge 到数据库
        await this.storeChallenge(
          userId || 'anonymous',
          options.challenge,
          'registration',
          {
            name: userInfo?.name,
            display_name: userInfo?.displayName,
            user_did: userDid,
            email: userInfo?.name // 如果 name 是 email 的话
          }
        );

        logger.debug('Stored registration challenge successfully', {
          userId,
          challenge: options.challenge,
          operationType: 'registration'
        });

        return {
          publicKey: options,
          isNewUser: true
        };
      }

      logger.debug('Generating authentication options for existing user', { userId });

      // 生成认证选项
      const authenticators = await this.getAuthenticators({ userId });
      logger.debug('Found existing authenticators', {
        userId,
        authenticatorCount: authenticators.length,
        authenticators: authenticators.map(auth => ({
          id: auth.id,
          credentialId: auth.credentialId,
          friendlyName: auth.friendlyName,
          lastUsedAt: auth.lastUsedAt
        }))
      });

      const options = await generateAuthenticationOptions({
        rpID: this.config.rpID,
        allowCredentials: authenticators.map(auth => ({
          id: auth.credentialId,
          type: 'public-key',
          transports: auth.transports
        })),
        userVerification: 'preferred'
      });

      logger.debug('Generated authentication options', {
        challenge: options.challenge,
        userId,
        rpID: options.rpId,
        allowCredentialsCount: options.allowCredentials?.length || 0
      });

      // 存储 challenge 到数据库
      await this.storeChallenge(
        userId,
        options.challenge,
        'authentication',
        {
          name: userInfo?.name,
          display_name: userInfo?.displayName,
          user_did: userDid
        }
      );

      logger.debug('Stored authentication challenge successfully', {
        userId,
        challenge: options.challenge,
        operationType: 'authentication'
      });

      return {
        publicKey: options,
        isNewUser: false
      };
    } catch (error) {
      logger.error('Failed to generate authentication options', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        userDid,
        userInfo
      });
      throw new WebAuthnError(
        'Failed to generate authentication options',
        WebAuthnErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * 统一的验证响应方法
   */
  async verifyAuthenticationResponse(
    response: AuthenticatorResponse
  ): Promise<AuthenticationResult> {
    try {
      logger.debug('Starting authentication response verification', {
        responseType: 'response' in response ? 'registration' : 'authentication',
        credentialId: response.id
      });

      // 从 clientDataJSON 中提取 challenge
      const clientDataJSON = JSON.parse(
        Buffer.from('response' in response ? response.response.clientDataJSON : '', 'base64').toString('utf-8')
      );

      logger.debug('Parsed client data JSON', { 
        clientDataJSON,
        challenge: clientDataJSON.challenge,
        origin: clientDataJSON.origin,
        type: clientDataJSON.type
      });
      
      // 获取 challenge 数据
      const challengeData = await this.getChallenge(clientDataJSON.challenge);
      if (!challengeData) {
        logger.error('Challenge not found or expired', {
          challenge: clientDataJSON.challenge,
          clientOrigin: clientDataJSON.origin
        });
        throw new WebAuthnError(
          'Invalid or expired challenge',
          WebAuthnErrorCode.INVALID_CHALLENGE
        );
      }

      logger.debug('Found challenge data', {
        userId: challengeData.user_id,
        operationType: challengeData.operation_type,
        clientData: challengeData.client_data,
        challenge: challengeData.challenge
      });

      const isRegistration = challengeData.operation_type === 'registration';
      
      logger.debug('Determined operation type', {
        isRegistration,
        operationType: challengeData.operation_type
      });
      
      if (isRegistration) {
        logger.debug('Processing registration response');
        return this.handleRegistrationResponse(response as RegistrationResponseJSON, challengeData);
      } else {
        logger.debug('Processing authentication response');
        return this.handleAuthenticationResponse(response as AuthenticationResponseJSON, challengeData);
      }
    } catch (error) {
      logger.error('Failed to verify authentication response', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        credentialId: response?.id,
        responseType: 'response' in response ? 'registration' : 'authentication'
      });
      throw new WebAuthnError(
        'Failed to verify authentication response',
        WebAuthnErrorCode.AUTHENTICATION_FAILED,
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
        WebAuthnErrorCode.REMOVE_DEVICE_FAILED,
        error
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
      isAnonymous: userId === 'anonymous'
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
      logger.error('Failed to store challenge', { 
        error: error.message,
        details: error.details,
        hint: error.hint,
        userId, 
        challenge,
        operationType
      });
      throw new WebAuthnError(
        'Failed to store challenge',
        WebAuthnErrorCode.INTERNAL_ERROR,
        error
      );
    }

    logger.debug('Challenge stored successfully', {
      userId,
      challenge,
      operationType,
      expiresAt,
      isAnonymous: userId === 'anonymous'
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

  private async getAuthenticators(filter: { userId?: string; credentialId?: string; id?: string } = {}): Promise<Authenticator[]> {
    try {
      let query = supabase
        .from('authenticators')
        .select('*');

      if (filter.userId) {
        query = query.eq('user_id', filter.userId);
      }
      if (filter.credentialId) {
        query = query.eq('credential_id', filter.credentialId);
      }
      if (filter.id) {
        query = query.eq('id', filter.id);
      }

      const { data, error } = await query;

      if (error) {
        throw new WebAuthnError(
          'Failed to get authenticators',
          WebAuthnErrorCode.DATABASE_ERROR,
          error
        );
      }

      return (data || []).map(auth => ({
        id: auth.id,
        userId: auth.user_id,
        credentialId: auth.credential_id,
        credentialPublicKey: Buffer.from(auth.credential_public_key, 'hex'),
        counter: auth.counter,
        credentialDeviceType: auth.credential_device_type,
        credentialBackedUp: auth.credential_backed_up,
        transports: auth.transports,
        friendlyName: auth.friendly_name,
        lastUsedAt: auth.last_used_at ? new Date(auth.last_used_at) : undefined,
        createdAt: new Date(auth.created_at),
        updatedAt: new Date(auth.updated_at)
      }));
    } catch (error) {
      logger.error('Failed to get authenticators', { error, filter });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Failed to get authenticators',
        WebAuthnErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  private async getAuthenticatorByUserId(userId: string): Promise<Authenticator[]> {
    return this.getAuthenticators({ userId });
  }

  private async getAuthenticatorByCredentialId(credentialId: string): Promise<Authenticator | null> {
    const authenticators = await this.getAuthenticators({ credentialId });
    return authenticators[0] || null;
  }

  private async createAuthenticator(data: CreateAuthenticatorData): Promise<Authenticator> {
    try {
      const { data: authenticator, error } = await supabase
        .from('authenticators')
        .insert({
          user_id: data.userId,
          credential_id: data.credentialId,
          credential_public_key: data.credentialPublicKey.toString('hex'),
          counter: data.counter,
          credential_device_type: data.credentialDeviceType,
          credential_backed_up: data.credentialBackedUp,
          transports: data.transports,
          friendly_name: data.friendlyName
        })
        .select()
        .single();

      if (error) {
        throw new WebAuthnError(
          'Failed to create authenticator',
          WebAuthnErrorCode.DATABASE_ERROR,
          error
        );
      }

      return {
        id: authenticator.id,
        userId: authenticator.user_id,
        credentialId: authenticator.credential_id,
        credentialPublicKey: authenticator.credential_public_key,
        counter: authenticator.counter,
        credentialDeviceType: authenticator.credential_device_type,
        credentialBackedUp: authenticator.credential_backed_up,
        transports: authenticator.transports,
        friendlyName: authenticator.friendly_name,
        lastUsedAt: authenticator.last_used_at ? new Date(authenticator.last_used_at) : undefined,
        createdAt: new Date(authenticator.created_at),
        updatedAt: new Date(authenticator.updated_at)
      };
    } catch (error) {
      logger.error('Failed to create authenticator', { error });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Failed to create authenticator',
        WebAuthnErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  private async updateAuthenticator(data: UpdateAuthenticatorData): Promise<void> {
    try {
      const { error } = await supabase
        .from('authenticators')
        .update({
          counter: data.counter,
          last_used_at: data.lastUsedAt
        })
        .eq('id', data.id);

      if (error) {
        throw new WebAuthnError(
          'Failed to update authenticator',
          WebAuthnErrorCode.DATABASE_ERROR,
          error
        );
      }
    } catch (error) {
      logger.error('Failed to update authenticator', { error });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Failed to update authenticator',
        WebAuthnErrorCode.DATABASE_ERROR,
        error
      );
    }
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
   * 清理过期的挑战
   */
  async cleanupExpiredChallenges(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_expired_webauthn_challenges');
      if (error) {
        throw new WebAuthnError(
          'Failed to cleanup challenges',
          WebAuthnErrorCode.DATABASE_ERROR,
          error
        );
      }
      return data || 0;
    } catch (error) {
      logger.error('Failed to cleanup challenges', { error });
      throw new WebAuthnError(
        'Failed to cleanup challenges',
        WebAuthnErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * Get challenge by challenge string
   */
  async getChallenge(challenge: string): Promise<ChallengeData | null> {
    try {
      logger.debug('Looking up challenge', { 
        challenge,
        timestamp: new Date().toISOString()
      });

      const { data, error } = await supabase
        .from('webauthn_challenges')
        .select('*')
        .eq('challenge', challenge)
        .single();

      if (error) {
        logger.debug('Challenge lookup error', {
          error: error.message,
          details: error.details,
          hint: error.hint,
          challenge
        });
        return null;
      }

      if (!data) {
        logger.debug('Challenge not found in database', { challenge });
        return null;
      }

      // 检查是否过期
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      const isExpired = now > expiresAt;
      const isUsed = !!data.used_at;

      logger.debug('Challenge found', {
        challenge,
        userId: data.user_id,
        operationType: data.operation_type,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        usedAt: data.used_at,
        isExpired,
        isUsed,
        timeUntilExpiry: isExpired ? 'expired' : `${Math.round((expiresAt.getTime() - now.getTime()) / 1000)}s`
      });

      if (isExpired) {
        logger.warn('Challenge has expired', {
          challenge,
          expiresAt: data.expires_at,
          now: now.toISOString()
        });
        return null;
      }

      if (isUsed) {
        logger.warn('Challenge has already been used', {
          challenge,
          usedAt: data.used_at
        });
        return null;
      }

      return {
        user_id: data.user_id,
        challenge: data.challenge,
        operation_type: data.operation_type,
        client_data: data.client_data || {}
      };
    } catch (error) {
      logger.error('Failed to get challenge', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        challenge 
      });
      return null;
    }
  }


  /**
   * 开发环境辅助方法：重置认证器的counter
   * 用于解决Chrome DevTools虚拟认证器counter重置问题
   */
  async resetAuthenticatorCounter(credentialId: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Counter reset not allowed in production environment');
      return false;
    }

    try {
      const { error } = await supabase
        .from('authenticators')
        .update({ counter: 0 })
        .eq('credential_id', credentialId);

      if (error) {
        logger.error('Failed to reset authenticator counter', { error, credentialId });
        return false;
      }

      logger.info('Authenticator counter reset for development', { credentialId });
      return true;
    } catch (error) {
      logger.error('Failed to reset authenticator counter', { error, credentialId });
      return false;
    }
  }

  /**
   * 开发环境辅助方法：重置用户的所有认证器counter
   */
  async resetUserAuthenticatorCounters(userId: string): Promise<number> {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Counter reset not allowed in production environment');
      return 0;
    }

    try {
      const { data, error } = await supabase
        .from('authenticators')
        .update({ counter: 0 })
        .eq('user_id', userId)
        .select('id');

      if (error) {
        logger.error('Failed to reset user authenticator counters', { error, userId });
        return 0;
      }

      const resetCount = data?.length || 0;
      logger.info('Reset all authenticator counters for user', { userId, resetCount });
      return resetCount;
    } catch (error) {
      logger.error('Failed to reset user authenticator counters', { error, userId });
      return 0;
    }
  }

  private async handleRegistrationResponse(
    response: RegistrationResponseJSON,
    challengeData: ChallengeData
  ): Promise<AuthenticationResult> {
    try {
      if (!challengeData.user_id) {
        throw new WebAuthnError(
          'User ID is required for registration',
          WebAuthnErrorCode.INVALID_STATE
        );
      }

      logger.debug('Starting registration response handling', {
        userId: challengeData.user_id,
        credentialId: response.id
      });

      // 验证注册响应
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new WebAuthnError(
          'Registration verification failed',
          WebAuthnErrorCode.REGISTRATION_FAILED
        );
      }

      const { registrationInfo } = verification;

      logger.debug('Registration verification successful', {
        userId: challengeData.user_id,
        credentialId: response.id,
        credentialDeviceType: registrationInfo.credentialDeviceType,
        credentialBackedUp: registrationInfo.credentialBackedUp
      });

      // 检查是否已存在相同的凭证
      const existingAuthenticator = await this.getAuthenticators({ credentialId: response.id });
      if (existingAuthenticator.length > 0) {
        throw new WebAuthnError(
          'Authenticator already registered',
          WebAuthnErrorCode.DUPLICATE_REGISTRATION
        );
      }

      // 获取用户信息以检查是否是临时用户
      const user = await DatabaseService.getUserById(challengeData.user_id);
      if (!user) {
        throw new WebAuthnError(
          'User not found',
          WebAuthnErrorCode.USER_NOT_FOUND
        );
      }

      logger.debug('Found user for registration', {
        userId: user.id,
        userDid: user.user_did,
        isTemporary: user.user_did?.startsWith('did:temp:')
      });

      // 检查是否是临时用户，如果是则需要更新 DID
      const finalUserId = challengeData.user_id;
      if (user.user_did?.startsWith('did:temp:')) {
        logger.debug('Updating temporary user DID', {
          userId: user.id,
          oldDid: user.user_did
        });

        try {
          // 从公钥生成真实的 DID
          const publicKey = Buffer.from(registrationInfo.credential.publicKey);
          const realDid = this.generateDIDFromPublicKey(publicKey);

          logger.debug('Generated real DID from public key', {
            userId: user.id,
            oldDid: user.user_did,
            newDid: realDid
          });

          // 更新用户的 DID 和移除临时标记
          const { error: updateError } = await supabase
            .from('users')
            .update({
              user_did: realDid,
              metadata: {
                ...user.metadata,
                is_temporary: false,
                temporary_did_updated_at: new Date().toISOString(),
                original_temp_did: user.user_did
              }
            })
            .eq('id', user.id);

          if (updateError) {
            logger.error('Failed to update user DID', {
              error: updateError,
              userId: user.id,
              oldDid: user.user_did,
              newDid: realDid
            });
            throw updateError;
          }

          logger.info('Successfully updated temporary user DID', {
            userId: user.id,
            oldDid: user.user_did,
            newDid: realDid
          });

        } catch (didError) {
          logger.error('Failed to update temporary user DID', {
            error: didError,
            userId: user.id,
            oldDid: user.user_did
          });
          // 不抛出错误，允许注册继续进行
          // 临时用户仍然可以使用，只是 DID 没有更新
        }
      }

      // 创建新的认证器
      const authenticator = await this.createAuthenticator({
        userId: challengeData.user_id,
        credentialId: response.id,
        credentialPublicKey: Buffer.from(registrationInfo.credential.publicKey),
        counter: registrationInfo.credential.counter || 0,
        credentialDeviceType: registrationInfo.credentialDeviceType,
        credentialBackedUp: registrationInfo.credentialBackedUp,
        transports: response.response.transports || [],
        friendlyName: 'Default Device'
      });

      logger.debug('Created authenticator successfully', {
        authenticatorId: authenticator.id,
        userId: challengeData.user_id,
        credentialId: authenticator.credentialId
      });

      const session_with_user = await this.sessionService.createSession(
        challengeData.user_id,
        authenticator.id,
        challengeData.client_data
      );

      logger.debug('Created session successfully', {
        sessionId: session_with_user.session.id,
        userId: challengeData.user_id
      });

      return {
        success: true,
        credential: {
          id: authenticator.credentialId,
          type: 'public-key',
          transports: authenticator.transports
        },
        session: mapToSession(session_with_user),
        isNewUser: true
      };
    } catch (error) {
      logger.error('Registration failed', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        userId: challengeData.user_id,
        credentialId: response.id
      });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Registration failed',
        WebAuthnErrorCode.REGISTRATION_FAILED,
        error
      );
    }
  }

  /**
   * 从公钥生成 DID
   */
  private generateDIDFromPublicKey(publicKeyBuffer: ArrayBuffer): string {
    try {
      // 解析 COSE key
      const publicKeyBytes = Buffer.from(publicKeyBuffer);
      const coseKey = decode(publicKeyBytes) as Map<number, any>;
      
      logger.debug('Decoded COSE key', {
        coseKey: Object.fromEntries(coseKey.entries()),
        keyType: coseKey.get(1), // kty
        algorithm: coseKey.get(3), // alg
      });

      // 提取实际的公钥
      // 对于 Ed25519，公钥在 -2 字段
      const rawPublicKey = coseKey.get(-2);
      
      if (!rawPublicKey) {
        throw new Error('Could not extract public key from COSE key');
      }

      logger.debug('Generated DID from raw public key', {
        rawPublicKeyHex: Buffer.from(rawPublicKey).toString('hex'),
        length: rawPublicKey.length
      });
      
      // 将原始公钥转换为 ArrayBuffer
      const rawPublicKeyBuffer = rawPublicKey.buffer.slice(
        rawPublicKey.byteOffset,
        rawPublicKey.byteOffset + rawPublicKey.length
      );
      
      return DIDKeyManager.generateDIDFromEd25519PublicKey(rawPublicKeyBuffer);
    } catch (error) {
      logger.error('Failed to generate DID from public key', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        publicKeyType: publicKeyBuffer.constructor.name,
        isArrayBuffer: publicKeyBuffer instanceof ArrayBuffer,
        isBuffer: Buffer.isBuffer(publicKeyBuffer)
      });
      throw new WebAuthnError(
        'Failed to generate DID from public key',
        WebAuthnErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  private async handleAuthenticationResponse(
    response: AuthenticationResponseJSON,
    challengeData: ChallengeData
  ): Promise<AuthenticationResult> {
    try {
      // 获取认证器
      const authenticators = await this.getAuthenticators({ credentialId: response.id });
      if (authenticators.length === 0) {
        throw new WebAuthnError(
          'Authenticator not found',
          WebAuthnErrorCode.INVALID_CREDENTIAL
        );
      }

      const authenticator = authenticators[0];

      // 验证认证响应
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: false,
        credential: {
          id: authenticator.credentialId,
          publicKey: authenticator.credentialPublicKey,
          counter: authenticator.counter,
        }
      });

      if (!verification.verified) {
        throw new WebAuthnError(
          'Authentication verification failed',
          WebAuthnErrorCode.AUTHENTICATION_FAILED
        );
      }

      // 更新认证器计数器
      await this.updateAuthenticator({
        id: authenticator.id,
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date()
      });

      // 创建会话
      const session_with_user = await this.sessionService.createSession(
        authenticator.userId,
        authenticator.id,
        challengeData.client_data
      );

      return {
        success: true,
        credential: {
          id: authenticator.credentialId,
          type: 'public-key',
          transports: authenticator.transports
        },
        session: mapToSession(session_with_user),
        isNewUser: false
      };
    } catch (error) {
      logger.error('Authentication failed', { error });
      throw error instanceof WebAuthnError ? error : new WebAuthnError(
        'Authentication failed',
        WebAuthnErrorCode.AUTHENTICATION_FAILED,
        error
      );
    }
  }

  /**
   * 获取用户的凭证列表
   */
  async getUserCredentials(userId: string): Promise<CredentialInfo[]> {
    try {
      const authenticators = await this.getAuthenticators({ userId });
      return authenticators.map(auth => ({
        id: auth.id,
        name: auth.friendlyName || 'Unknown Device',
        type: auth.credentialDeviceType,
        lastUsed: auth.lastUsedAt?.toISOString() || 'Never',
        credentialId: auth.credentialId,
        transports: auth.transports
      }));
    } catch (error) {
      logger.error('Failed to get user credentials', { error, userId });
      throw new WebAuthnError(
        'Failed to get user credentials',
        WebAuthnErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 删除凭证
   */
  async removeCredential(userId: string, credentialId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('authenticators')
        .delete()
        .eq('user_id', userId)
        .eq('id', credentialId);

      if (error) {
        throw new WebAuthnError(
          'Failed to remove credential',
          WebAuthnErrorCode.DATABASE_ERROR,
          error
        );
      }

      return true;
    } catch (error) {
      logger.error('Failed to remove credential', { error, userId, credentialId });
      throw new WebAuthnError(
        'Failed to remove credential',
        WebAuthnErrorCode.REMOVE_DEVICE_FAILED,
        error
      );
    }
  }
}

export const webauthnService = new WebAuthnService(); 