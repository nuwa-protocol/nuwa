import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { WebAuthnService } from '../services/webauthnService.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';
import { SessionService } from '../services/sessionService.js';
import { DatabaseService } from '../services/database.js';
import crypto from 'crypto';
import {
  registrationOptionsSchema,
  verifySchema,
  authenticationOptionsSchema,
} from '../schemas/webauthn.js';

const router: Router = Router();
const webauthnService = new WebAuthnService();

const removeDeviceSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid(),
  }),
});

// Add WebAuthn configuration endpoint
router.get('/.well-known/webauthn', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    version: '1.0',
    rp: {
      id: process.env.WEBAUTHN_RP_ID || 'localhost',
      name: process.env.WEBAUTHN_RP_NAME || 'CADOP Service',
      icon: `${process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'}/favicon.ico`
    }
  });
});

// /**
//  * POST /api/webauthn/registration/options
//  * Generate WebAuthn registration options
//  */
// router.post(
//   '/registration/options',
//   validateRequest(registrationOptionsSchema),
//   async (req: Request, res: Response) => {
//     try {
//       logger.debug('Received registration options request', {
//         body: req.body,
//         headers: req.headers,
//       });

//       const { email, display_name, friendly_name } = req.body;

//       // Check if user exists
//       const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
//       if (userError) {
//         logger.error('Failed to list users from Supabase', { error: userError });
//         throw userError;
//       }

//       logger.debug('Found existing users', { 
//         usersCount: users?.length,
//         emails: users?.map(u => u.email)
//       });

//       const existingUser = users?.find(u => u.email === email);
//       if (!existingUser) {
//         logger.debug('Creating new user', { email, display_name });
//         // Create a new user if not exists
//         const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
//           email,
//           email_confirm: true,
//           user_metadata: {
//             full_name: display_name
//           }
//         });

//         if (createError) {
//           logger.error('Failed to create new user', { error: createError });
//           throw createError;
//         }

//         logger.debug('New user created', { 
//           userId: newUser.user.id,
//           email: newUser.user.email,
//           metadata: newUser.user.user_metadata
//         });

//         const options = await webauthnService.generateRegistrationOptions(
//           newUser.user.id,
//           email,
//           display_name || email
//         );

//         logger.debug('Generated registration options for new user', {
//           userId: newUser.user.id,
//           email,
//           options,
//           challengeLength: options.challenge.length,
//           friendlyName: friendly_name,
//         });

//         return res.json({
//           success: true,
//           options,
//           user_id: newUser.user.id
//         });
//       }

//       logger.debug('Found existing user', { 
//         userId: existingUser.id,
//         email: existingUser.email,
//         metadata: existingUser.user_metadata
//       });

//       // Generate options for existing user
//       const options = await webauthnService.generateRegistrationOptions(
//         existingUser.id,
//         email,
//         display_name || email
//       );

//       logger.debug('Generated registration options for existing user', {
//         userId: existingUser.id,
//         email,
//         options,
//         challengeLength: options.challenge.length,
//         friendlyName: friendly_name,
//       });

//       return res.json({
//         success: true,
//         options,
//         user_id: existingUser.id
//       });
//     } catch (error) {
//       logger.error('Failed to generate WebAuthn registration options', {
//         error,
//         stack: error instanceof Error ? error.stack : undefined,
//         body: req.body,
//       });

//       return res.status(500).json({
//         error: 'Failed to generate registration options',
//         code: 'REGISTRATION_OPTIONS_FAILED',
//         details: process.env['NODE_ENV'] === 'development' ? error : undefined,
//       });
//     }
//   }
// );

/**
 * POST /api/webauthn/registration/verify
 * Verify WebAuthn registration response
 */
router.post(
  '/registration/verify',
  validateRequest(verifySchema),
  async (req: Request, res: Response) => {
    try {
      logger.debug('Received registration verification request', {
        body: req.body,
        headers: req.headers,
      });

      const { response, friendly_name } = req.body;
      
      // Extract user ID from the clientDataJSON
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, 'base64').toString('utf-8')
      );
      
      // Get user ID from the challenge data
      const challenge = await webauthnService.getChallenge(clientDataJSON.challenge);
      if (!challenge || !challenge.user_id) {
        logger.warn('Invalid or expired challenge', { clientDataJSON });
        return res.status(400).json({
          error: 'Invalid or expired challenge',
          code: 'INVALID_CHALLENGE',
        });
      }

      const userId = challenge.user_id;
      
      logger.debug('Verifying registration response', {
        userId,
        response,
        friendly_name,
      });

      const result = await webauthnService.verifyRegistrationResponse(
        userId,
        response,
        friendly_name
      );

      if (result.success) {
        logger.info('WebAuthn registration successful', {
          userId,
          authenticatorId: result.authenticator?.id,
          friendlyName: friendly_name,
          result,
        });

        res.json({
          success: true,
          message: 'WebAuthn device registered successfully',
          authenticator: result.authenticator,
        });
      } else {
        logger.warn('WebAuthn registration failed', {
          userId,
          error: result.error,
          details: result.details,
        });

        res.status(400).json({
          success: false,
          error: result.error || 'Registration verification failed',
          code: 'REGISTRATION_VERIFICATION_FAILED',
          details: result.details,
        });
      }
    } catch (error) {
      logger.error('WebAuthn registration verification error', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
      });

      res.status(500).json({
        error: 'Registration verification failed',
        code: 'REGISTRATION_VERIFICATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * POST /api/webauthn/authentication/options
 * Generate WebAuthn authentication options
 */
router.post(
  '/authentication/options',
  validateRequest(authenticationOptionsSchema),
  async (req: Request, res: Response) => {
    try {
      const { user_identifier } = req.body;
      let userId: string | undefined;
      let isNewUser = false;
      logger.debug('Received authentication options request', {
        user_identifier,
        headers: req.headers,
      });
      // 如果提供了用户标识符，尝试查找或创建用户
      if (user_identifier) {
        if (user_identifier.includes('@')) {
          // 通过邮箱查找用户
          const user = await DatabaseService.getUserByEmail(user_identifier);
          if (user) {
            logger.debug('User found', { user });
            userId = user.id;
          } else {
            logger.debug('User not found, creating new user', { user_identifier });

            // 生成临时 DID
            const tempDid = `did:key:${crypto.randomBytes(32).toString('hex')}`;
            
            // 创建新用户
            const newUser = await DatabaseService.createUser({
              user_did: tempDid,
              email: user_identifier,
              display_name: user_identifier,
              metadata: {}
            });

            userId = newUser.id;
            isNewUser = true;
          }
        } else {
          // 假设是用户 ID
          userId = user_identifier;
        }
      }

      // 如果是新用户，生成注册选项
      if (isNewUser) {
        const options = await webauthnService.generateRegistrationOptions(
          userId!,
          user_identifier,
          user_identifier
        );

        logger.info('Generated registration options for new user', {
          userId,
          email: user_identifier,
          challengeLength: options.challenge.length
        });

        return res.json({
          success: true,
          options,
          isRegistration: true
        });
      }

      // 否则生成认证选项
      const options = await webauthnService.generateAuthenticationOptions(userId);

      logger.info('Generated authentication options', {
        userId: userId || 'anonymous',
        challengeLength: options.challenge.length,
        allowCredentialsCount: options.allowCredentials?.length || 0,
      });

      res.json({
        success: true,
        options,
        isRegistration: false
      });
    } catch (error) {
      logger.error('Failed to generate WebAuthn options', {
        error,
        userIdentifier: req.body.user_identifier,
      });

      res.status(500).json({
        error: 'Failed to generate options',
        code: 'OPTIONS_FAILED',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * POST /api/webauthn/verify
 * Verify WebAuthn registration or authentication response
 */
router.post(
  '/verify',
  validateRequest(verifySchema),
  async (req: Request, res: Response) => {
    try {
      const { response } = req.body;
      
      logger.debug('🎯 Received verification request', {
        credentialId: response.id,
        responseType: response.type,
        authenticatorAttachment: response.authenticatorAttachment,
        hasUserHandle: !!response.response.userHandle
      });

      // 从 clientDataJSON 中提取 challenge
      const clientDataJSON = JSON.parse(
        Buffer.from(response.response.clientDataJSON, 'base64').toString('utf-8')
      );
      
      // 获取 challenge 数据
      const challengeData = await webauthnService.getChallenge(clientDataJSON.challenge);
      if (!challengeData) {
        return res.status(400).json({
          error: 'Invalid or expired challenge',
          code: 'INVALID_CHALLENGE'
        });
      }

      // 检查是否是注册流程
      const isRegistration = challengeData.operation_type === 'registration';
      
      // 验证响应
      let verificationResult;
      if (isRegistration) {
        // 处理注册响应
        verificationResult = await webauthnService.verifyRegistrationResponse(
          challengeData.user_id,
          response as any, // 类型转换
          'Default Device'
        );

        if (!verificationResult.success || !verificationResult.authenticator) {
          return res.status(401).json({
            success: false,
            error: verificationResult.error || 'Registration failed',
            code: 'REGISTRATION_FAILED',
            details: verificationResult.details,
          });
        }

        // 使用注册结果创建会话
        const userId = challengeData.user_id;
        const authenticatorId = verificationResult.authenticator.id;

        // 获取用户信息
        const userData = await DatabaseService.getUserById(userId);
        if (!userData) {
          logger.error('Failed to get user data', { userId });
          throw new Error('Failed to get user data');
        }

        // 创建新会话
        const sessionService = new SessionService();
        const session = await sessionService.createSession(
          userId,
          verificationResult.authenticator.credentialId,
          {
            email: userData.email,
            display_name: userData.display_name
          }
        );

        logger.info('WebAuthn registration successful', {
          userId,
          authenticatorId,
          sessionId: session.id
        });

        return res.json({
          success: true,
          session: {
            session_token: session.session_token,
            expires_at: session.expires_at,
            user: {
              id: userData.id,
              email: userData.email,
              display_name: userData.display_name
            }
          }
        });
      } else {
        // 处理认证响应
        verificationResult = await webauthnService.verifyAuthenticationResponse(response);

        if (!verificationResult.success || !verificationResult.userId || !verificationResult.authenticatorId) {
          return res.status(401).json({
            success: false,
            error: verificationResult.error || 'Authentication failed',
            code: 'AUTHENTICATION_FAILED',
            details: verificationResult.details,
          });
        }

        // 获取用户信息
        const userData = await DatabaseService.getUserById(verificationResult.userId);
        if (!userData) {
          logger.error('Failed to get user data', {
            userId: verificationResult.userId,
          });
          throw new Error('Failed to get user data');
        }

        // 创建新会话
        const sessionService = new SessionService();
        const { data: authenticator } = await supabase
          .from('authenticators')
          .select('credential_id')
          .eq('id', verificationResult.authenticatorId)
          .single();

        if (!authenticator) {
          throw new Error('Failed to get authenticator data');
        }

        const session = await sessionService.createSession(
          verificationResult.userId,
          authenticator.credential_id,
          {
            email: userData.email,
            display_name: userData.display_name
          }
        );

        logger.info('WebAuthn authentication successful', {
          userId: verificationResult.userId,
          authenticatorId: verificationResult.authenticatorId,
          sessionId: session.id
        });

        return res.json({
          success: true,
          session: {
            session_token: session.session_token,
            expires_at: session.expires_at,
            user: {
              id: userData.id,
              email: userData.email,
              display_name: userData.display_name
            }
          }
        });
      }
    } catch (error) {
      logger.error('WebAuthn verification error', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(500).json({
        error: 'Verification failed',
        code: 'VERIFICATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * GET /api/webauthn/devices
 * Get user's registered WebAuthn devices
 */
router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const devices = await webauthnService.getUserDevices(userId);

    res.json({
      success: true,
      devices,
    });
  } catch (error) {
    logger.error('Failed to get user WebAuthn devices', {
      error,
      userId: req.user?.id,
    });

    res.status(500).json({
      error: 'Failed to get devices',
      code: 'GET_DEVICES_FAILED',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
});

/**
 * DELETE /api/webauthn/devices/:deviceId
 * Remove a WebAuthn device
 */
router.delete(
  '/devices/:deviceId',
  requireAuth,
  validateRequest(removeDeviceSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const deviceId = req.params['deviceId'];

      if (!deviceId) {
        return res.status(400).json({
          error: 'Device ID is required',
          code: 'DEVICE_ID_REQUIRED',
        });
      }

      const success = await webauthnService.removeDevice(userId, deviceId);

      if (success) {
        logger.info('WebAuthn device removed', {
          userId,
          deviceId,
        });

        return res.json({
          success: true,
          message: 'Device removed successfully',
        });
      } else {
        return res.status(404).json({
          error: 'Device not found',
          code: 'DEVICE_NOT_FOUND',
        });
      }
    } catch (error) {
      logger.error('Failed to remove WebAuthn device', {
        error,
        userId: req.user?.id,
        deviceId: req.params['deviceId'],
      });

      return res.status(500).json({
        error: 'Failed to remove device',
        code: 'REMOVE_DEVICE_FAILED',
        details: process.env['NODE_ENV'] === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * POST /api/webauthn/cleanup
 * Cleanup expired challenges (admin endpoint)
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const cleanedCount = await webauthnService.cleanupExpiredChallenges();

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired challenges`,
      count: cleanedCount,
    });
  } catch (error) {
    logger.error('Failed to cleanup expired WebAuthn challenges', { error });

    res.status(500).json({
      error: 'Failed to cleanup expired challenges',
      code: 'CLEANUP_FAILED',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
});

router.post('/register/begin', requireAuth, 
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const authUser = await supabase.auth.getUser(req.headers.authorization?.split(' ')[1]);
      
      if (authUser.error) {
        return res.status(401).json({ 
          error: 'User not found',
          details: process.env['NODE_ENV'] === 'development' ? authUser.error : undefined,
        });
      }

      const userEmail = authUser.data.user.email;
      const userName = authUser.data.user.user_metadata?.['full_name'] || userEmail;

      if (!userEmail) {
        return res.status(400).json({
          error: 'User email is required',
          code: 'EMAIL_REQUIRED',
        });
      }

      const options = await webauthnService.generateRegistrationOptions(
        userId,
        userEmail,
        userName
      );

      return res.json(options);
    } catch (error) {
      logger.error('Failed to generate registration options', { error });
      return res.status(500).json({
        error: 'Failed to generate registration options',
        userId: req.user?.id,
        details: process.env['NODE_ENV'] === 'development' ? error : undefined,
      });
    }
  }
);

router.post('/authenticate/begin', requireAuth, 
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      const options = await webauthnService.generateAuthenticationOptions(userId);

      return res.json(options);
    } catch (error) {
      logger.error('Failed to generate authentication options', { error });
      return res.status(500).json({
        error: 'Failed to generate authentication options',
        userId: req.user?.id,
        details: process.env['NODE_ENV'] === 'development' ? error : undefined,
      });
    }
  }
);

router.get('/test', (req: Request, res: Response) => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const rpID = req.hostname;
  
  return res.json({
    isWebAuthnSupported: true,
    isSecureContext: isSecure,
    rpID,
    origin: `${req.protocol}://${req.get('host')}`,
    userAgent: req.headers['user-agent'],
    features: {
      publicKeyCredential: 'Available in browser',
      conditionalMediation: 'Check browser support'
    },
    redirectTo: process.env['FRONTEND_URL'] || 'http://localhost:3000',
  });
});

// 开发环境专用路由
if (process.env.NODE_ENV !== 'production') {
  /**
   * POST /api/webauthn/dev/reset-counter
   * 重置指定认证器的counter（仅开发环境）
   */
  router.post('/dev/reset-counter', async (req: Request, res: Response) => {
    try {
      const { credentialId } = req.body;
      
      if (!credentialId) {
        return res.status(400).json({
          error: 'credentialId is required',
          code: 'MISSING_CREDENTIAL_ID',
        });
      }

      const result = await webauthnService.resetAuthenticatorCounter(credentialId);
      
      if (result) {
        logger.info('Authenticator counter reset successfully', { credentialId });
        res.json({ success: true, message: 'Counter reset successfully' });
      } else {
        res.status(500).json({
          error: 'Failed to reset counter',
          code: 'RESET_FAILED',
        });
      }
    } catch (error) {
      logger.error('Failed to reset authenticator counter', { error });
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  /**
   * POST /api/webauthn/dev/reset-user-counters
   * 重置用户所有认证器的counter（仅开发环境）
   */
  router.post('/dev/reset-user-counters', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
      }

      const resetCount = await webauthnService.resetUserAuthenticatorCounters(userId);
      
      logger.info('User authenticator counters reset successfully', { userId, resetCount });
      res.json({ 
        success: true, 
        message: `Reset ${resetCount} authenticator counters`,
        resetCount 
      });
    } catch (error) {
      logger.error('Failed to reset user authenticator counters', { error });
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}

export default router; 