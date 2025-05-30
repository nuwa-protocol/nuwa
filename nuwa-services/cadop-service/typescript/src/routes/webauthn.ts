import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { webauthnService } from '../services/webauthnService';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { supabase } from '../config/supabase';

const router = Router();

// Validation schemas
const registrationOptionsSchema = z.object({
  body: z.object({
    friendly_name: z.string().min(1).max(100).optional(),
  }),
});

const registrationResponseSchema = z.object({
  body: z.object({
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
  }),
});

const authenticationOptionsSchema = z.object({
  body: z.object({
    user_identifier: z.string().optional(), // email or user ID
  }),
});

const authenticationResponseSchema = z.object({
  body: z.object({
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
  }),
});

const removeDeviceSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid(),
  }),
});

/**
 * POST /api/webauthn/registration/options
 * Generate WebAuthn registration options
 */
router.post(
  '/registration/options',
  requireAuth,
  validateRequest(registrationOptionsSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { friendly_name } = req.body;

      // Get user email from Supabase Auth
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
      if (authError || !authUser.user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      const userEmail = authUser.user.email;
      const userName = authUser.user.user_metadata?.['full_name'] || userEmail;

      if (!userEmail) {
        return res.status(400).json({
          error: 'User email is required for WebAuthn registration',
          code: 'EMAIL_REQUIRED',
        });
      }

      const options = await webauthnService.generateRegistrationOptions(
        userId,
        userEmail,
        userName
      );

      logger.info('WebAuthn registration options generated', {
        userId,
        challengeLength: options.challenge.length,
        friendlyName: friendly_name,
      });

      return res.json({
        success: true,
        options,
      });
    } catch (error) {
      logger.error('Failed to generate WebAuthn registration options', {
        error,
        userId: req.user?.id,
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
  requireAuth,
  validateRequest(registrationResponseSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { response, friendly_name } = req.body;

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
        userId: req.user?.id,
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

      if (result.success && result.user_id) {
        // Create or update session
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: '', // This will be filled by the session creation
          options: {
            redirectTo: process.env.FRONTEND_URL || 'http://localhost:3000',
          },
        });

        if (sessionError) {
          logger.error('Failed to create session after WebAuthn authentication', {
            error: sessionError,
            userId: result.user_id,
          });
        }

        logger.info('WebAuthn authentication successful', {
          userId: result.user_id,
          authenticatorId: result.authenticator_id,
        });

        res.json({
          success: true,
          message: 'Authentication successful',
          user_id: result.user_id,
          authenticator_id: result.authenticator_id,
          session: sessionData?.properties,
        });
      } else {
        logger.warn('WebAuthn authentication failed', {
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