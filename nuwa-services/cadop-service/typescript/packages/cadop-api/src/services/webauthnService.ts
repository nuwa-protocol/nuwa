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
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
        excludeCredentials: existingAuthenticators?.map(auth => ({
          id: auth.credentialId,
          type: 'public-key' as const,
          transports: auth.transports,
        })) || [],
        authenticatorSelection: {
          residentKey: 'preferred' as ResidentKeyRequirement,
          userVerification: 'preferred' as UserVerificationRequirement,
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

      const { registrationInfo } = verification;

      // 检查现有的凭证
      const query = supabase
        .from('authenticators')
        .select('*')
        .eq('credential_id', response.id);

      const { data: existingAuthenticator, error } = await query;

      if (!error && existingAuthenticator && existingAuthenticator.length > 0) {
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
      const { data: createdAuthenticator, error: verifyError } = await supabase
        .from('authenticators')
        .select('*')
        .eq('id', authenticator.id)
        .single();

      if (verifyError || !createdAuthenticator) {
        logger.error('Failed to verify created authenticator', {
          error: verifyError,
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
   * Generate authentication options for an existing WebAuthn credential
   */
  async generateAuthenticationOptions(
    userIdentifier?: string
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    try {
      let allowCredentials: { id: string; type: 'public-key'; transports?: AuthenticatorTransportFuture[]; }[] | undefined;

      if (userIdentifier) {
        // 如果是邮箱，先检查用户是否存在
        if (userIdentifier.includes('@')) {
          const { data: authUser, error } = await supabase.auth.admin.listUsers();
          if (!error && authUser.users) {
            const user = authUser.users.find(u => u.email === userIdentifier);
            if (!user) {
              // 用户不存在，生成注册选项
              const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: userIdentifier,
                email_confirm: true,
                user_metadata: {
                  full_name: userIdentifier
                }
              });

              if (createError) {
                throw createError;
              }

              // 生成注册选项
              const options = await generateRegistrationOptions({
                rpName: this.config.rpName,
                rpID: this.config.rpID,
                userID: Buffer.from(newUser.user.id),
                userName: userIdentifier,
                userDisplayName: userIdentifier,
                timeout: this.config.timeout,
                attestationType: this.config.attestationType,
                supportedAlgorithmIDs: [-7, -257], // ES256, RS256
                authenticatorSelection: {
                  residentKey: 'preferred' as ResidentKeyRequirement,
                  userVerification: 'preferred' as UserVerificationRequirement,
                },
              });

              // 存储 challenge
              await this.storeChallenge(newUser.user.id, options.challenge, 'registration', {
                email: userIdentifier,
                user_name: userIdentifier,
              });

              return options;
            } else {
              // 用户存在，获取其认证器
              const query = supabase
                .from('authenticators')
                .select('*')
                .eq('user_id', user.id);

              const { data: authenticators, error } = await query;

              if (!error && authenticators) {
                allowCredentials = authenticators.map(auth => ({
                  id: auth.credential_id,
                  type: 'public-key' as const,
                  transports: auth.transports,
                }));
              }
            }
          }
        } else {
          // 假设是用户 ID，直接获取认证器
          const query = supabase
            .from('authenticators')
            .select('*')
            .eq('user_id', userIdentifier);

          const { data: authenticators, error } = await query;

          if (!error && authenticators) {
            allowCredentials = authenticators.map(auth => ({
              id: auth.credential_id,
              type: 'public-key' as const,
              transports: auth.transports,
            }));
          }
        }
      }

      const options = {
        timeout: this.config.timeout,
        allowCredentials,
        userVerification: 'preferred' as UserVerificationRequirement,
        rpID: this.config.rpID,
      };

      const authenticationOptions = await generateAuthenticationOptions(options);

      // 存储 challenge
      await this.storeChallenge(userIdentifier || 'anonymous', authenticationOptions.challenge, 'authentication', {});

      return authenticationOptions;
    } catch (error) {
      logger.error('Failed to generate authentication options', { error, userIdentifier });
      throw new WebAuthnError(
        'Failed to generate authentication options'
      );
    }
  }

  /**
   * Debug helper: Check database state
   */
  private async debugDatabaseState(userId: string) {
    const { data: authenticators, error } = await supabase
      .from('authenticators')
      .select('*')
      .eq('user_id', userId);

    logger.debug('Current database state', {
      userId,
      authenticatorsCount: authenticators?.length || 0,
      authenticators: authenticators?.map(auth => ({
        id: auth.id,
        credentialId: auth.credential_id,
        userId: auth.user_id,
        counter: auth.counter,
        lastUsedAt: auth.last_used_at
      }))
    });
  }

  /**
   * Verify authentication response
   */
  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
    expectedChallenge?: string
  ): Promise<WebAuthnAuthenticationResult> {
    try {
      logger.debug('🚀 Starting authentication response verification', { 
        credentialId: response.id,
        responseType: response.type,
        hasSignature: !!response.response.signature,
        hasAuthenticatorData: !!response.response.authenticatorData,
        authenticatorDataLength: response.response.authenticatorData?.length || 0
      });

      // 如果有 userHandle，先检查数据库状态
      if (response.response.userHandle) {
        const userId = Buffer.from(response.response.userHandle, 'base64').toString('utf-8');
        await this.debugDatabaseState(userId);
      }

      // 解析authenticatorData来获取counter信息
      const authenticatorDataBase64 = response.response.authenticatorData;
      const authenticatorDataBuffer = Buffer.from(authenticatorDataBase64, 'base64');
      
      logger.debug('🔍 Raw AuthenticatorData Analysis (Server):', {
        credentialId: response.id,
        authenticatorDataBase64,
        authenticatorDataLength: authenticatorDataBuffer.length,
        authenticatorDataHex: authenticatorDataBuffer.toString('hex'),
        // 解析基本结构
        rpIdHash: authenticatorDataBuffer.slice(0, 32).toString('hex'),
        flags: authenticatorDataBuffer.length > 32 ? authenticatorDataBuffer[32].toString(2).padStart(8, '0') : 'N/A',
        rawCounterBytes: authenticatorDataBuffer.length >= 37 ? 
          Array.from(authenticatorDataBuffer.slice(33, 37)) : 'N/A',
        extractedCounterValue: authenticatorDataBuffer.length >= 37 ? 
          authenticatorDataBuffer.readUInt32BE(33) : 'N/A'
      });

      // 先尝试直接通过 credential_id 查找认证器
      const query = supabase
        .from('authenticators')
        .select('*')
        .eq('credential_id', response.id);

      const { data: authenticators, error } = await query;

      if (error || !authenticators || authenticators.length === 0) {
        logger.warn('Authenticator not found by credential_id, trying user handle', { 
          credentialId: response.id,
          error,
          rawId: response.rawId // 添加 rawId 以便比较
        });

        // 如果找不到，尝试通过 user handle 查找
        if (response.response.userHandle) {
          const userId = Buffer.from(response.response.userHandle, 'base64').toString('utf-8');
          logger.debug('Looking up authenticators by user handle', {
            userId,
            decodedUserHandle: userId,
            originalUserHandle: response.response.userHandle
          });

          const { data: userAuthenticators, error: userError } = await supabase
            .from('authenticators')
            .select('*')
            .eq('user_id', userId);

          if (userError) {
            logger.error('Failed to query authenticators by user_id', {
              error: userError,
              userId
            });
          }

          logger.debug('Found authenticators by user_id', {
            userId,
            authenticatorsCount: userAuthenticators?.length || 0,
            authenticators: userAuthenticators?.map(a => ({
              id: a.id,
              credentialId: a.credential_id
            }))
          });

          if (!userError && userAuthenticators && userAuthenticators.length > 0) {
            // 尝试通过 rawId 匹配
            const matchingAuthenticator = userAuthenticators.find(auth => 
              auth.credential_id === response.rawId || 
              auth.credential_id === response.id
            );

            if (matchingAuthenticator) {
              logger.info('Found authenticator by matching rawId/id', {
                userId,
                authenticatorId: matchingAuthenticator.id,
                credentialId: matchingAuthenticator.credential_id,
                matchedWith: matchingAuthenticator.credential_id === response.rawId ? 'rawId' : 'id'
              });

              let challengeStr: string;
              if (expectedChallenge) {
                challengeStr = expectedChallenge;
              } else {
                // 对于匿名认证流程，先尝试查找匿名 challenge
                let challenge = await this.getAndConsumeChallenge(null, 'authentication');
                
                // 如果没找到匿名 challenge，再尝试使用用户特定的 challenge
                if (!challenge && matchingAuthenticator.user_id) {
                  challenge = await this.getAndConsumeChallenge(matchingAuthenticator.user_id, 'authentication');
                }

                if (!challenge) {
                  return {
                    success: false,
                    error: `Challenge not found or expired for authenticator(${response.id})`,
                  };
                }
                challengeStr = challenge.challenge;
              }

              // 处理公钥格式
              let publicKey: Buffer;
              try {
                const publicKeyData = matchingAuthenticator.credential_public_key;
                
                if (typeof publicKeyData === 'string') {
                  publicKey = Buffer.from(publicKeyData, 'hex');
                } 
                else if (publicKeyData && typeof publicKeyData === 'object' && 
                         'type' in publicKeyData && publicKeyData.type === 'Buffer' &&
                         'data' in publicKeyData && Array.isArray(publicKeyData.data)) {
                  publicKey = Buffer.from(publicKeyData.data as number[]);
                }
                else if (Buffer.isBuffer(publicKeyData)) {
                  publicKey = publicKeyData;
                }
                else {
                  publicKey = Buffer.from(String(publicKeyData), 'hex');
                }
              } catch (error) {
                logger.error('Failed to process public key', { 
                  error, 
                  publicKeyType: typeof matchingAuthenticator.credential_public_key,
                  publicKeyData: matchingAuthenticator.credential_public_key 
                });
                return {
                  success: false,
                  error: 'Invalid public key format',
                };
              }

              const opts = {
                response,
                expectedChallenge: challengeStr,
                expectedOrigin: this.config.origin,
                expectedRPID: this.config.rpID,
                credential: {
                  id: matchingAuthenticator.credential_id,
                  publicKey: new Uint8Array(publicKey),
                  counter: matchingAuthenticator.counter,
                },
                requireUserVerification: false,
              };

              let verification;
              try {
                verification = await verifyAuthenticationResponse(opts);
                
                if (!verification.verified) {
                  logger.warn('❌ WebAuthn authentication verification failed', {
                    userId: matchingAuthenticator.user_id,
                    authenticatorId: matchingAuthenticator.id,
                    verification,
                    storedCounter: matchingAuthenticator.counter,
                    newCounter: verification.authenticationInfo?.newCounter
                  });
                  return {
                    success: false,
                    error: 'Authentication verification failed',
                  };
                }
              } catch (error) {
                logger.error('💥 Failed to verify authentication response', { 
                  error, 
                  errorMessage: error instanceof Error ? error.message : String(error),
                  errorStack: error instanceof Error ? error.stack : undefined,
                  credentialId: matchingAuthenticator.credential_id,
                  storedCounter: matchingAuthenticator.counter,
                  extractedCounter: authenticatorDataBuffer.length >= 37 ? 
                    authenticatorDataBuffer.readUInt32BE(33) : 'N/A'
                });
                return {
                  success: false,
                  error: 'Failed to verify authentication response',
                };
              }

              // 更新认证器使用时间和计数器
              await this.updateAuthenticator({
                id: matchingAuthenticator.id, 
                counter: verification.authenticationInfo.newCounter, 
                lastUsedAt: new Date()
              });

              logger.info('🎉 WebAuthn authentication successful', {
                userId: matchingAuthenticator.user_id,
                authenticatorId: matchingAuthenticator.id,
                counterUpdated: `${matchingAuthenticator.counter} → ${verification.authenticationInfo.newCounter}`
              });

              return {
                success: true,
                userId: matchingAuthenticator.user_id,
                authenticatorId: matchingAuthenticator.id
              };
            }

            // 如果没有匹配的，使用第一个认证器
            const authenticator = userAuthenticators[0];
            logger.info('Using first available authenticator', {
              userId,
              authenticatorId: authenticator.id,
              credentialId: authenticator.credential_id
            });

            let challengeStr: string;
            if (expectedChallenge) {
              challengeStr = expectedChallenge;
            } else {
              // 对于匿名认证流程，先尝试查找匿名 challenge
              let challenge = await this.getAndConsumeChallenge(null, 'authentication');
              
              // 如果没找到匿名 challenge，再尝试使用用户特定的 challenge
              if (!challenge && authenticator.user_id) {
                challenge = await this.getAndConsumeChallenge(authenticator.user_id, 'authentication');
              }

              if (!challenge) {
                return {
                  success: false,
                  error: `Challenge not found or expired for authenticator(${response.id})`,
                };
              }
              challengeStr = challenge.challenge;
            }

            // 处理公钥格式
            let publicKey: Buffer;
            try {
              const publicKeyData = authenticator.credential_public_key;
              
              if (typeof publicKeyData === 'string') {
                publicKey = Buffer.from(publicKeyData, 'hex');
              } 
              else if (publicKeyData && typeof publicKeyData === 'object' && 
                       'type' in publicKeyData && publicKeyData.type === 'Buffer' &&
                       'data' in publicKeyData && Array.isArray(publicKeyData.data)) {
                publicKey = Buffer.from(publicKeyData.data as number[]);
              }
              else if (Buffer.isBuffer(publicKeyData)) {
                publicKey = publicKeyData;
              }
              else {
                publicKey = Buffer.from(String(publicKeyData), 'hex');
              }
            } catch (error) {
              logger.error('Failed to process public key', { 
                error, 
                publicKeyType: typeof authenticator.credential_public_key,
                publicKeyData: authenticator.credential_public_key 
              });
              return {
                success: false,
                error: 'Invalid public key format',
              };
            }

            const opts = {
              response,
              expectedChallenge: challengeStr,
              expectedOrigin: this.config.origin,
              expectedRPID: this.config.rpID,
              credential: {
                id: authenticator.credential_id,
                publicKey: new Uint8Array(publicKey),
                counter: authenticator.counter,
              },
              requireUserVerification: false,
            };

            logger.debug('⚙️ Verification Options:', { 
              credentialId: authenticator.credential_id,
              expectedCounter: authenticator.counter,
              extractedCounterFromAuthData: authenticatorDataBuffer.length >= 37 ? 
                authenticatorDataBuffer.readUInt32BE(33) : 'N/A',
              expectedOrigin: this.config.origin,
              expectedRPID: this.config.rpID,
              publicKeyLength: publicKey.length,
              publicKeyHex: publicKey.toString('hex').substring(0, 32) + '...' // 只显示前32个字符
            });

            let verification: VerifiedAuthenticationResponse;
            try {
              verification = await verifyAuthenticationResponse(opts);
              
              logger.debug('✅ Verification Result Details:', { 
                verified: verification.verified,
                newCounter: verification.authenticationInfo?.newCounter,
                previousCounter: authenticator.counter,
                counterIncreased: verification.authenticationInfo?.newCounter > authenticator.counter,
                credentialId: authenticator.credential_id
              });
              
              if (!verification.verified) {
                logger.warn('❌ WebAuthn authentication verification failed', {
                  userId: authenticator.user_id,
                  authenticatorId: authenticator.id,
                  verification,
                  storedCounter: authenticator.counter,
                  newCounter: verification.authenticationInfo?.newCounter
                });
                return {
                  success: false,
                  error: 'Authentication verification failed',
                };
              }
            } catch (error) {
              logger.error('💥 Failed to verify authentication response', { 
                error, 
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                credentialId: authenticator.credential_id,
                storedCounter: authenticator.counter,
                extractedCounter: authenticatorDataBuffer.length >= 37 ? 
                  authenticatorDataBuffer.readUInt32BE(33) : 'N/A',
                opts: {
                  ...opts,
                  response: {
                    ...opts.response,
                    response: {
                      ...opts.response.response,
                      signature: '[REDACTED]' // 不记录签名数据
                    }
                  }
                }
              });
              return {
                success: false,
                error: 'Failed to verify authentication response',
              };
            }      

            // We don't need to increment the counter here
            // because some platforms do not increment the counter https://stackoverflow.com/questions/78776653/passkey-counter-always-0-macos
            // We just store the new counter in the database
            await this.updateAuthenticator({id: authenticator.id, counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date()});

            logger.info('🎉 WebAuthn authentication successful', {
              userId: authenticator.user_id,
              authenticatorId: authenticator.id,
              counterUpdated: `${authenticator.counter} → ${verification.authenticationInfo.newCounter}`
            });

            return {
              success: true,
              userId: authenticator.user_id,
              authenticatorId: authenticator.id
            };
          }
        }

        logger.error('Authenticator not found', { 
          error, 
          response,
          credentialId: response.id,
          rawId: response.rawId,
          userHandle: response.response.userHandle
        });
        return {
          success: false,
          error: `Authenticator not found via credentialId(${response.id})`,
        };
      }

      const authenticator = authenticators[0];

      logger.debug('📊 Current Authenticator State:', { 
        authenticatorId: authenticator.id,
        storedCounter: authenticator.counter,
        userId: authenticator.user_id,
        credentialId: authenticator.credential_id,
        lastUsedAt: authenticator.last_used_at
      });

      let challengeStr: string;
      if (expectedChallenge) {
        challengeStr = expectedChallenge;
      } else {
        // 对于匿名认证流程，先尝试查找匿名 challenge
        let challenge = await this.getAndConsumeChallenge(null, 'authentication');
        
        // 如果没找到匿名 challenge，再尝试使用用户特定的 challenge
        if (!challenge && authenticator.user_id) {
          challenge = await this.getAndConsumeChallenge(authenticator.user_id, 'authentication');
        }

        if (!challenge) {
          return {
            success: false,
            error: `Challenge not found or expired for authenticator(${response.id})`,
          };
        }
        challengeStr = challenge.challenge;
      }

      // 处理公钥格式 - 确保正确转换
      let publicKey: Buffer;
      try {
        const publicKeyData = authenticator.credential_public_key;
        
        // 检查是否是字符串（十六进制）
        if (typeof publicKeyData === 'string') {
          publicKey = Buffer.from(publicKeyData, 'hex');
        } 
        // 检查是否是 Buffer 对象的 JSON 表示
        else if (publicKeyData && typeof publicKeyData === 'object' && 
                 'type' in publicKeyData && publicKeyData.type === 'Buffer' &&
                 'data' in publicKeyData && Array.isArray(publicKeyData.data)) {
          publicKey = Buffer.from(publicKeyData.data as number[]);
        }
        // 检查是否已经是 Buffer
        else if (Buffer.isBuffer(publicKeyData)) {
          publicKey = publicKeyData;
        }
        // 尝试直接转换
        else {
          publicKey = Buffer.from(String(publicKeyData), 'hex');
        }
      } catch (error) {
        logger.error('Failed to process public key', { 
          error, 
          publicKeyType: typeof authenticator.credential_public_key,
          publicKeyData: authenticator.credential_public_key 
        });
        return {
          success: false,
          error: 'Invalid public key format',
        };
      }

      const opts = {
        response,
        expectedChallenge: challengeStr,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        credential: {
          id: authenticator.credential_id,
          publicKey: new Uint8Array(publicKey),
          counter: authenticator.counter,
        },
        requireUserVerification: false,
      };

      logger.debug('⚙️ Verification Options:', { 
        credentialId: authenticator.credential_id,
        expectedCounter: authenticator.counter,
        extractedCounterFromAuthData: authenticatorDataBuffer.length >= 37 ? 
          authenticatorDataBuffer.readUInt32BE(33) : 'N/A',
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        publicKeyLength: publicKey.length,
        publicKeyHex: publicKey.toString('hex').substring(0, 32) + '...' // 只显示前32个字符
      });

      let verification: VerifiedAuthenticationResponse;
      try {
        verification = await verifyAuthenticationResponse(opts);
        
        logger.debug('✅ Verification Result Details:', { 
          verified: verification.verified,
          newCounter: verification.authenticationInfo?.newCounter,
          previousCounter: authenticator.counter,
          counterIncreased: verification.authenticationInfo?.newCounter > authenticator.counter,
          credentialId: authenticator.credential_id
        });
        
        if (!verification.verified) {
          logger.warn('❌ WebAuthn authentication verification failed', {
            userId: authenticator.user_id,
            authenticatorId: authenticator.id,
            verification,
            storedCounter: authenticator.counter,
            newCounter: verification.authenticationInfo?.newCounter
          });
          return {
            success: false,
            error: 'Authentication verification failed',
          };
        }
      } catch (error) {
        logger.error('💥 Failed to verify authentication response', { 
          error, 
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          credentialId: authenticator.credential_id,
          storedCounter: authenticator.counter,
          extractedCounter: authenticatorDataBuffer.length >= 37 ? 
            authenticatorDataBuffer.readUInt32BE(33) : 'N/A',
          opts: {
            ...opts,
            response: {
              ...opts.response,
              response: {
                ...opts.response.response,
                signature: '[REDACTED]' // 不记录签名数据
              }
            }
          }
        });
        return {
          success: false,
          error: 'Failed to verify authentication response',
        };
      }      

      // We don't need to increment the counter here
      // because some platforms do not increment the counter https://stackoverflow.com/questions/78776653/passkey-counter-always-0-macos
      // We just store the new counter in the database
      await this.updateAuthenticator({id: authenticator.id, counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date()});

      logger.info('🎉 WebAuthn authentication successful', {
        userId: authenticator.user_id,
        authenticatorId: authenticator.id,
        counterUpdated: `${authenticator.counter} → ${verification.authenticationInfo.newCounter}`
      });

      return {
        success: true,
        userId: authenticator.user_id,
        authenticatorId: authenticator.id
      };
    } catch (error: unknown) {
      logger.error('WebAuthn authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
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

  private async getAuthenticators(filter: { userId?: string; credentialId?: string; id?: string } = {}): Promise<Authenticator[]> {
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

    if (error || !data) return [];

    return data.map(item => {
      // 处理从数据库读取的 credential_public_key
      let publicKey: Buffer;
      const publicKeyData = item.credential_public_key;
      
      // 检查是否是字符串（十六进制）
      if (typeof publicKeyData === 'string') {
        publicKey = Buffer.from(publicKeyData, 'hex');
      } 
      // 检查是否是 Buffer 对象的 JSON 表示
      else if (publicKeyData && typeof publicKeyData === 'object' && 
               'type' in publicKeyData && publicKeyData.type === 'Buffer' &&
               'data' in publicKeyData && Array.isArray(publicKeyData.data)) {
        publicKey = Buffer.from(publicKeyData.data as number[]);
      }
      // 检查是否已经是 Buffer
      else if (Buffer.isBuffer(publicKeyData)) {
        publicKey = publicKeyData;
      }
      // 尝试直接转换
      else {
        publicKey = Buffer.from(String(publicKeyData), 'hex');
      }

      return {
        id: item.id,
        userId: item.user_id,
        credentialId: item.credential_id,
        credentialPublicKey: publicKey,
        counter: item.counter,
        credentialDeviceType: item.credential_device_type,
        credentialBackedUp: item.credential_backed_up,
        transports: item.transports,
        friendlyName: item.friendly_name,
        aaguid: item.aaguid,
        lastUsedAt: item.last_used_at ? new Date(item.last_used_at) : undefined,
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at),
      };
    });
  }

  private async getAuthenticatorByUserId(userId: string): Promise<Authenticator[]> {
    return this.getAuthenticators({ userId });
  }

  private async getAuthenticatorByCredentialId(credentialId: string): Promise<Authenticator | null> {
    const authenticators = await this.getAuthenticators({ credentialId });
    return authenticators[0] || null;
  }

  private async createAuthenticator(data: CreateAuthenticatorData): Promise<Authenticator> {
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
      friendly_name: data.friendlyName
    };

    logger.debug('Creating authenticator in database', {
      userId: data.userId,
      credentialId: data.credentialId,
      publicKeyLength: publicKeyHex.length / 2,
      publicKeyType: 'hex',
      publicKeyHex,
      dbData
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
        dbData
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

  private async updateAuthenticator(data: {
    id: string;
    counter: number;
    lastUsedAt: Date;
  }): Promise<void> {
    logger.debug('Updating authenticator', { data });
    const dbData = {
      counter: data.counter,
      last_used_at: data.lastUsedAt,
    };
    const { error } = await supabase
      .from('authenticators')
      .update(dbData)
      .eq('id', data.id);

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
  async getChallenge(challenge: string): Promise<{ 
    user_id: string; 
    email: string; 
    challenge: Buffer;
    operation_type: 'registration' | 'authentication';
  } | null> {
    try {
      logger.debug('Looking up challenge', {
        originalChallenge: challenge,
      });

      const { data, error } = await supabase
        .from('webauthn_challenges')
        .select('user_id, challenge, client_data, operation_type')
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
        challenge: base64URLToBuffer(data.challenge),
        operation_type: data.operation_type
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

    // 使用 getAuthenticators 获取认证器信息
    const authenticators = await this.getAuthenticators({ id: result.authenticatorId });
    const authenticator = authenticators[0];

    if (!authenticator) {
      logger.error('Authenticator not found', {
        authenticatorId: result.authenticatorId
      });
      throw new Error('Authenticator not found');
    }

    const { error } = await supabase
      .from('authenticators')
      .update({
        last_used_at: new Date(),
        counter: authenticator.counter + 1
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
}

export const webauthnService = new WebAuthnService(); 