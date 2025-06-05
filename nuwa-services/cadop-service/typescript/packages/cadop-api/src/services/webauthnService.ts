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
  CadopError,
  CadopErrorCode,
  AuthenticationOptions,
  AuthenticationResult,
  Authenticator,
  WebAuthnConfig,
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
import { WebAuthnChallengesRepository, WebAuthnChallengeRecord } from '../repositories/webauthnChallenges.js';
import { AuthenticatorRepository, AuthenticatorRecord } from '../repositories/authenticators.js';

type AuthenticatorResponse = RegistrationResponseJSON | AuthenticationResponseJSON;

// Input type for creating authenticator
interface CreateAuthenticatorData {
  userId: string;
  credentialId: string;
  credentialPublicKey: Buffer | Uint8Array;
  counter: number;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  friendlyName?: string;
}

export class WebAuthnService {
  private config: WebAuthnConfig;
  private sessionService: SessionService;
  private challengesRepo: WebAuthnChallengesRepository;
  private authenticatorRepo: AuthenticatorRepository;

  constructor() {
    this.config = {
      rpName: process.env['WEBAUTHN_RP_NAME'] || 'CADOP Service',
      rpID: process.env['WEBAUTHN_RP_ID'] || 'localhost',
      origin: process.env['WEBAUTHN_ORIGIN'] || 'http://localhost:3000',
      timeout: parseInt(process.env['WEBAUTHN_CHALLENGE_TIMEOUT'] || '300000'),
      attestationType: 'none',
    };
    this.sessionService = new SessionService();
    this.challengesRepo = new WebAuthnChallengesRepository();
    this.authenticatorRepo = new AuthenticatorRepository();
    logger.debug('WebAuthn service initialized with config', { config: this.config });
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
        throw new CadopError(
          'No valid registration challenge found',
          CadopErrorCode.INVALID_CHALLENGE
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
        throw new CadopError(
          'Registration verification failed',
          CadopErrorCode.AUTHENTICATION_FAILED
        );
      }

      const { registrationInfo } = verification;

      // check if the credential is already registered
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

      // ensure the public key is in the correct format
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

      // verify if the authenticator is created correctly
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
   * generate authentication options for a user
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
        // lookup or create user
        const user = await DatabaseService.getUserByDID(userDid);
        if (user) {
          userId = user.id;
          logger.debug('Found existing user', { userId, userDid });
        } else {
          logger.debug('User not found, creating new user', { userDid });
          const newUser = await DatabaseService.createUser({
            user_did: userDid,
            display_name: userInfo?.displayName || userDid,
            metadata: {}
          });
          userId = newUser.id;
          isNewUser = true;
          logger.debug('Created new user', { userId, userDid, displayName: newUser.display_name });
        }
      } else {
        // if no DID is provided, create a temporary user
        logger.debug('No DID provided, creating temporary user for registration');
        
        // generate a temporary user ID and DID
        const tempUserId = crypto.randomUUID();
        const tempDid = `did:temp:${tempUserId}`;
        
        // create a temporary user record
        const tempUser = await DatabaseService.createUser({
          user_did: tempDid,
          display_name: userInfo?.displayName || 'New User',
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

        // generate registration options
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

        // store challenge to database
        await this.storeChallenge(
          userId || 'anonymous',
          options.challenge,
          'registration',
          {
            name: userInfo?.name,
            display_name: userInfo?.displayName,
            user_did: userDid,
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

      // generate authentication options
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

      // store challenge to database
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
      throw new CadopError(
        'Failed to generate authentication options',
        CadopErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * verify authentication response
   */
  async verifyAuthenticationResponse(
    response: AuthenticatorResponse
  ): Promise<AuthenticationResult> {
    try {
      logger.debug('Starting authentication response verification', {
        responseType: 'response' in response ? 'registration' : 'authentication',
        credentialId: response.id
      });

      // extract challenge from clientDataJSON
      const clientDataJSON = JSON.parse(
        Buffer.from('response' in response ? response.response.clientDataJSON : '', 'base64').toString('utf-8')
      );

      logger.debug('Parsed client data JSON', { 
        clientDataJSON,
        challenge: clientDataJSON.challenge,
        origin: clientDataJSON.origin,
        type: clientDataJSON.type
      });
      
      // get challenge data
      const challengeData = await this.getChallenge(clientDataJSON.challenge);
      if (!challengeData) {
        logger.error('Challenge not found or expired', {
          challenge: clientDataJSON.challenge,
          clientOrigin: clientDataJSON.origin
        });
        throw new CadopError(
          'Invalid or expired challenge',
          CadopErrorCode.INVALID_CHALLENGE
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
      throw new CadopError(
        'Failed to verify authentication response',
        CadopErrorCode.AUTHENTICATION_FAILED,
        error
      );
    }
  }

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
      isAnonymous: !userId || userId === 'anonymous'
    });

    await this.challengesRepo.create({
      user_id: !userId || userId === 'anonymous' ? undefined : userId,
      challenge: challenge,
      operation_type: operationType,
      client_data: clientData,
      expires_at: expiresAt
    });

    logger.debug('Challenge stored successfully', {
      userId,
      challenge,
      operationType,
      expiresAt,
      isAnonymous: !userId || userId === 'anonymous'
    });
  }

  private async getAndConsumeChallenge(
    userId: string | null,
    operationType: 'registration' | 'authentication'
  ): Promise<{ user_id: string | null; email: string; challenge: string } | null> {
    // get the latest active challenge
    const challenge = await this.challengesRepo.getLatestActiveChallenge(userId, operationType);

    if (!challenge) {
      logger.warn('Challenge not found', { 
        userId,
        operationType
      });
      return null;
    }

    // mark the challenge as used
    await this.challengesRepo.markAsUsed(challenge.id);

    return {
      user_id: challenge.user_id || null,
      email: challenge.client_data.email,
      challenge: challenge.challenge,
    };
  }


  private async getAuthenticators(filter: { userId?: string; credentialId?: string; id?: string } = {}): Promise<Authenticator[]> {
    try {
      let authenticators: AuthenticatorRecord[] = [];

      if (filter.userId) {
        authenticators = await this.authenticatorRepo.findByUserId(filter.userId);
      } else if (filter.credentialId) {
        const authenticator = await this.authenticatorRepo.findByCredentialId(filter.credentialId);
        authenticators = authenticator ? [authenticator] : [];
      } else if (filter.id) {
        const authenticator = await this.authenticatorRepo.findById(filter.id);
        authenticators = authenticator ? [authenticator] : [];
      }

      return authenticators.map(auth => ({
        id: auth.id,
        userId: auth.user_id,
        credentialId: auth.credential_id,
        credentialPublicKey: Buffer.from(auth.credential_public_key, 'hex'),
        counter: auth.counter,
        credentialDeviceType: auth.credential_device_type === 'platform' ? 'singleDevice' : 'multiDevice',
        credentialBackedUp: auth.credential_backed_up,
        transports: auth.transports,
        friendlyName: auth.friendly_name,
        lastUsedAt: auth.last_used_at,
        createdAt: auth.created_at,
        updatedAt: auth.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get authenticators', { error, filter });
      throw error instanceof CadopError ? error : new CadopError(
        'Failed to get authenticators',
        CadopErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  private async getAuthenticatorByCredentialId(credentialId: string): Promise<Authenticator | null> {
    const authenticators = await this.getAuthenticators({ credentialId });
    return authenticators[0] || null;
  }

  private async createAuthenticator(data: CreateAuthenticatorData): Promise<Authenticator> {
    try {
      const authenticator = await this.authenticatorRepo.create({
        user_id: data.userId,
        credential_id: data.credentialId,
        credential_public_key: data.credentialPublicKey.toString('hex'),
        counter: data.counter,
        credential_device_type: data.credentialDeviceType === 'singleDevice' ? 'platform' : 'cross-platform',
        credential_backed_up: data.credentialBackedUp,
        transports: data.transports || [],
        friendly_name: data.friendlyName
      });

      return {
        id: authenticator.id,
        userId: authenticator.user_id,
        credentialId: authenticator.credential_id,
        credentialPublicKey: Buffer.from(authenticator.credential_public_key, 'hex'),
        counter: authenticator.counter,
        credentialDeviceType: authenticator.credential_device_type === 'platform' ? 'singleDevice' : 'multiDevice',
        credentialBackedUp: authenticator.credential_backed_up,
        transports: data.transports || [],
        friendlyName: data.friendlyName,
        lastUsedAt: authenticator.last_used_at,
        createdAt: authenticator.created_at,
        updatedAt: authenticator.updated_at
      };
    } catch (error) {
      logger.error('Failed to create authenticator', { error });
      throw error instanceof CadopError ? error : new CadopError(
        'Failed to create authenticator',
        CadopErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * cleanup expired challenges
   */
  async cleanupExpiredChallenges(): Promise<number> {
    try {
      return await this.challengesRepo.cleanupExpired();
    } catch (error) {
      logger.error('Failed to cleanup challenges', { error });
      throw new CadopError(
        'Failed to cleanup challenges',
        CadopErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * Get challenge by challenge string
   */
  async getChallenge(challenge: string): Promise<WebAuthnChallengeRecord | null> {
    try {
      logger.debug('Looking up challenge', { 
        challenge,
        timestamp: new Date().toISOString()
      });

      const data = await this.challengesRepo.getByChallenge(challenge);

      if (!data) {
        logger.debug('Challenge not found in database', { challenge });
        return null;
      }

      // check if the challenge is expired
      const now = new Date();
      const isExpired = now > data.expires_at;
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
        timeUntilExpiry: isExpired ? 'expired' : `${Math.round((data.expires_at.getTime() - now.getTime()) / 1000)}s`
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

      return data;
    } catch (error) {
      logger.error('Failed to get challenge', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        challenge 
      });
      return null;
    }
  }

  private async handleRegistrationResponse(
    response: RegistrationResponseJSON,
    challengeData: WebAuthnChallengeRecord
  ): Promise<AuthenticationResult> {
    try {
      if (!challengeData.user_id) {
        throw new CadopError(
          'User ID is required for registration',
          CadopErrorCode.INVALID_STATE
        );
      }

      logger.debug('Starting registration response handling', {
        userId: challengeData.user_id,
        credentialId: response.id
      });

      // verify the registration response
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new CadopError(
          'Registration verification failed',
          CadopErrorCode.REGISTRATION_FAILED
        );
      }

      const { registrationInfo } = verification;

      logger.debug('Registration verification successful', {
        userId: challengeData.user_id,
        credentialId: response.id,
        credentialDeviceType: registrationInfo.credentialDeviceType,
        credentialBackedUp: registrationInfo.credentialBackedUp
      });

      // check if the credential is already registered
      const existingAuthenticator = await this.getAuthenticators({ credentialId: response.id });
      if (existingAuthenticator.length > 0) {
        throw new CadopError(
          'Authenticator already registered',
          CadopErrorCode.DUPLICATE_REGISTRATION
        );
      }

      // get user information to check if the user is a temporary user
      const user = await DatabaseService.getUserById(challengeData.user_id);
      if (!user) {
        throw new CadopError(
          'User not found',
          CadopErrorCode.USER_NOT_FOUND
        );
      }

      logger.debug('Found user for registration', {
        userId: user.id,
        userDid: user.user_did,
        isTemporary: user.user_did?.startsWith('did:temp:')
      });

      // check if the user is a temporary user, if so, update the DID
      if (user.user_did?.startsWith('did:temp:')) {
        logger.debug('Updating temporary user DID', {
          userId: user.id,
          oldDid: user.user_did
        });

        try {
          // generate the real DID from the public key
          const publicKey = Buffer.from(registrationInfo.credential.publicKey);
          const realDid = this.generateDIDFromPublicKey(publicKey);

          logger.debug('Generated real DID from public key', {
            userId: user.id,
            oldDid: user.user_did,
            newDid: realDid
          });

          // update the user's DID and remove the temporary flag
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
          // do not throw an error, allow the registration to continue
          // the temporary user can still be used, but the DID is not updated
        }
      }

      // create a new authenticator
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
      throw error instanceof CadopError ? error : new CadopError(
        'Registration failed',
        CadopErrorCode.REGISTRATION_FAILED,
        error
      );
    }
  }

  /**
   * generate a DID from a public key
   */
  private generateDIDFromPublicKey(publicKeyBuffer: ArrayBuffer): string {
    try {
      // parse the COSE key
      const publicKeyBytes = Buffer.from(publicKeyBuffer);
      const coseKey = decode(publicKeyBytes) as Map<number, any>;
      
      logger.debug('Decoded COSE key', {
        coseKey: Object.fromEntries(coseKey.entries()),
        keyType: coseKey.get(1), // kty
        algorithm: coseKey.get(3), // alg
      });

      // extract the actual public key
      // for Ed25519, the public key is in the -2 field
      const rawPublicKey = coseKey.get(-2);
      
      if (!rawPublicKey) {
        throw new Error('Could not extract public key from COSE key');
      }

      logger.debug('Generated DID from raw public key', {
        rawPublicKeyHex: Buffer.from(rawPublicKey).toString('hex'),
        length: rawPublicKey.length
      });
      
      // convert the raw public key to an ArrayBuffer
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
      throw new CadopError(
        'Failed to generate DID from public key',
        CadopErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  private async handleAuthenticationResponse(
    response: AuthenticationResponseJSON,
    challengeData: WebAuthnChallengeRecord
  ): Promise<AuthenticationResult> {
    try {
      // get the authenticator
      const authenticators = await this.getAuthenticators({ credentialId: response.id });
      if (authenticators.length === 0) {
        throw new CadopError(
          'Authenticator not found',
          CadopErrorCode.INVALID_CREDENTIAL
        );
      }

      const authenticator = authenticators[0];

      // verify the authentication response
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
        throw new CadopError(
          'Authentication verification failed',
          CadopErrorCode.AUTHENTICATION_FAILED
        );
      }

      // update the counter of the authenticator
      this.authenticatorRepo.updateCounter(authenticator.id, verification.authenticationInfo.newCounter);

      // create a session
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
      throw error instanceof CadopError ? error : new CadopError(
        'Authentication failed',
        CadopErrorCode.AUTHENTICATION_FAILED,
        error
      );
    }
  }

  /**
   * get user's registered WebAuthn credentials
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
      throw new CadopError(
        'Failed to get user credentials',
        CadopErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * remove a credential
   */
  async removeCredential(userId: string, credentialId: string): Promise<boolean> {
    try {
      await this.authenticatorRepo.delete(credentialId);
      return true;
    } catch (error) {
      logger.error('Failed to remove credential', { error, userId, credentialId });
      throw new CadopError(
        'Failed to remove credential',
        CadopErrorCode.REMOVE_DEVICE_FAILED,
        error
      );
    }
  }
}

export const webauthnService = new WebAuthnService(); 