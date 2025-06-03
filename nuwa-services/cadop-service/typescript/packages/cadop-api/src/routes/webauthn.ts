import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { webauthnService } from '../services/webauthnService.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';

const router: Router = Router();

// Validation schemas
const registrationOptionsSchema = z.object({
  email: z.string().email(),
  display_name: z.string().optional(),
  friendly_name: z.string().min(1).max(100).optional(),
});

const registrationResponseSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      attestationObject: z.string(),
      clientDataJSON: z.string(),
      transports: z.array(z.string()).optional(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.any()),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  }),
  friendly_name: z.string().min(1).max(100).optional(),
});

const authenticationOptionsSchema = z.object({
  user_identifier: z.string().optional(), // email or user ID
});

const authenticationResponseSchema = z.object({
  response: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.any()),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  }),
});

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

/**
 * POST /api/webauthn/registration/options
 * Generate WebAuthn registration options
 */
router.post(
  '/registration/options',
  validateRequest(registrationOptionsSchema),
  async (req: Request, res: Response) => {
    try {
      logger.debug('Received registration options request', {
        body: req.body,
        headers: req.headers,
      });

      const { email, display_name, friendly_name } = req.body;

      // Check if user exists
      const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) {
        logger.error('Failed to list users from Supabase', { error: userError });
        throw userError;
      }

      logger.debug('Found existing users', { 
        usersCount: users?.length,
        emails: users?.map(u => u.email)
      });

      const existingUser = users?.find(u => u.email === email);
      if (!existingUser) {
        logger.debug('Creating new user', { email, display_name });
        // Create a new user if not exists
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: display_name
          }
        });

        if (createError) {
          logger.error('Failed to create new user', { error: createError });
          throw createError;
        }

        logger.debug('New user created', { 
          userId: newUser.user.id,
          email: newUser.user.email,
          metadata: newUser.user.user_metadata
        });

        const options = await webauthnService.generateRegistrationOptions(
          newUser.user.id,
          email,
          display_name || email
        );

        logger.debug('Generated registration options for new user', {
          userId: newUser.user.id,
          email,
          options,
          challengeLength: options.challenge.length,
          friendlyName: friendly_name,
        });

        return res.json({
          success: true,
          options,
          user_id: newUser.user.id
        });
      }

      logger.debug('Found existing user', { 
        userId: existingUser.id,
        email: existingUser.email,
        metadata: existingUser.user_metadata
      });

      // Generate options for existing user
      const options = await webauthnService.generateRegistrationOptions(
        existingUser.id,
        email,
        display_name || email
      );

      logger.debug('Generated registration options for existing user', {
        userId: existingUser.id,
        email,
        options,
        challengeLength: options.challenge.length,
        friendlyName: friendly_name,
      });

      return res.json({
        success: true,
        options,
        user_id: existingUser.id
      });
    } catch (error) {
      logger.error('Failed to generate WebAuthn registration options', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
      });

      return res.status(500).json({
        error: 'Failed to generate registration options',
        code: 'REGISTRATION_OPTIONS_FAILED',
        details: process.env['NODE_ENV'] === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * POST /api/webauthn/registration/verify
 * Verify WebAuthn registration response
 */
router.post(
  '/registration/verify',
  validateRequest(registrationResponseSchema),
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

      // If user_identifier is provided, try to find the user
      if (user_identifier) {
        if (user_identifier.includes('@')) {
          // Email-based lookup
          const { data: authUser, error } = await supabase.auth.admin.listUsers();
          if (!error && authUser.users) {
            const user = authUser.users.find(u => u.email === user_identifier);
            if (user) {
              userId = user.id;
            }
          }
        } else {
          // Assume it's a user ID
          userId = user_identifier;
        }
      }

      const options = await webauthnService.generateAuthenticationOptions(userId);

      logger.info('WebAuthn authentication options generated', {
        userId: userId || 'anonymous',
        challengeLength: options.challenge.length,
        allowCredentialsCount: options.allowCredentials?.length || 0,
      });

      res.json({
        success: true,
        options,
      });
    } catch (error) {
      logger.error('Failed to generate WebAuthn authentication options', {
        error,
        userIdentifier: req.body.user_identifier,
      });

      res.status(500).json({
        error: 'Failed to generate authentication options',
        code: 'AUTHENTICATION_OPTIONS_FAILED',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      });
    }
  }
);

/**
 * POST /api/webauthn/authentication/verify
 * Verify WebAuthn authentication response
 */
router.post(
  '/authentication/verify',
  validateRequest(authenticationResponseSchema),
  async (req: Request, res: Response) => {
    try {
      const { response } = req.body;

      const result = await webauthnService.verifyAuthenticationResponse(response);

      if (result.success && result.userId) {
        // Get user data
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(result.userId);
        
        if (userError || !userData.user) {
          logger.error('Failed to get user data', {
            error: userError,
            userId: result.userId,
          });
          throw new Error('Failed to get user data');
        }

        // Create access token and refresh token
        const accessToken = jwt.sign(
          {
            sub: result.userId,
            email: userData.user.email,
            role: 'authenticated',
            aud: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
          },
          process.env.SUPABASE_JWT_SECRET || ''
        );

        const refreshToken = jwt.sign(
          {
            sub: result.userId,
            email: userData.user.email,
            role: 'authenticated',
            aud: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
            type: 'refresh',
          },
          process.env.SUPABASE_JWT_SECRET || ''
        );

        logger.info('WebAuthn authentication successful', {
          userId: result.userId,
          authenticatorId: result.authenticatorId,
        });

        res.json({
          success: true,
          message: 'Authentication successful',
          user_id: result.userId,
          authenticator_id: result.authenticatorId,
          session: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600, // 1 hour in seconds
            refresh_token_expires_in: 2592000, // 30 days in seconds
          },
        });
      } else {
        logger.warn('WebAuthn authentication failed, result: ', {
          result,
          error: result.error,
        });

        res.status(400).json({
          success: false,
          error: result.error || 'Authentication verification failed',
          code: 'AUTHENTICATION_VERIFICATION_FAILED',
          details: result.details,
        });
      }
    } catch (error) {
      logger.error('WebAuthn authentication verification error', {
        error,
      });

      res.status(500).json({
        error: 'Authentication verification failed',
        code: 'AUTHENTICATION_VERIFICATION_ERROR',
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

export default router; 