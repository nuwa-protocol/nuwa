import { Router, Request, Response } from 'express';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import {
  verifySchema,
  authenticationOptionsSchema,
  credentialSchema,
  CadopError,
  CadopErrorCode,
  createErrorResponse,
  createSuccessResponse,
  createErrorResponseFromError
} from '@cadop/shared';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router: Router = Router();

// Helper function to handle errors
const handleError = (error: unknown): { status: number; response: any } => {
  logger.error('API Error:', { error });
  
  if (error instanceof CadopError) {
    return {
      status: 400,
      response: createErrorResponse(error.message, error.code, error.details)
    };
  }
  
  if (error instanceof Error) {
    return {
      status: 500,
      response: createErrorResponse(error.message, CadopErrorCode.INTERNAL_ERROR)
    };
  }
  
  return {
    status: 500,
    response: createErrorResponse('Unknown error occurred', CadopErrorCode.INTERNAL_ERROR)
  };
};

// Add WebAuthn configuration endpoint
router.get('/.well-known/webauthn', async (req: Request, res: Response) => {
  const container = await ServiceContainer.getInstance();
  const webauthnService = container.getWebAuthnService();
  const config = webauthnService.getConfig();
  
  res.setHeader('Content-Type', 'application/json');
  res.json(createSuccessResponse({
    version: '1.0',
    rp: {
      id: config.rpID,
      name: config.rpName,
      icon: `${config.origin}/favicon.ico`
    }
  }));
});

/**
 * POST /api/webauthn/options
 * Generate WebAuthn authentication options
 */
router.post(
  '/options',
  validateRequest(authenticationOptionsSchema),
  async (req: Request, res: Response) => {
    try {
      const { user_did, name, display_name, existing_credential } = req.body;
      const container = await ServiceContainer.getInstance();
      const webauthnService = container.getWebAuthnService();
      const options = await webauthnService.generateAuthenticationOptions(user_did, {
        name,
        displayName: display_name,
        existing_credential
      });
      res.json(createSuccessResponse(options));
    } catch (error) {
      logger.error('Error generating authentication options', { error });
      res.status(500).json({ error: 'Failed to generate authentication options' });
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
      const container = await ServiceContainer.getInstance();
      const webauthnService = container.getWebAuthnService();
      const result = await webauthnService.verifyAuthenticationResponse(req.body.response);
      res.json(createSuccessResponse(result));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
    }
  }
);

/**
 * POST /api/webauthn/cleanup
 * Cleanup expired challenges (admin endpoint)
 */
router.post('/cleanup', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if user has admin privileges
    if (!req.user?.metadata?.isAdmin) {
      return res.status(403).json(createErrorResponse(
        'Insufficient privileges',
        'UNAUTHORIZED'
      ));
    }

    const container = await ServiceContainer.getInstance();
    const webauthnService = container.getWebAuthnService();
    const count = await webauthnService.cleanupExpiredChallenges();
    res.json(createSuccessResponse({ count }));
  } catch (error) {
    const { status, response } = handleError(error);
    res.status(status).json(response);
  }
});

/**
 * GET /api/webauthn/id-token
 * Get ID Token for the authenticated user
 */
router.get(
  '/id-token',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      logger.debug('Getting ID token for user', { 
        userId: req.user!.id
      });

      const container = await ServiceContainer.getInstance();
      const webauthnService = container.getWebAuthnService();
      const idToken = await webauthnService.getIdToken(req.user!.id);
      res.json(createSuccessResponse(idToken));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
    }
  }
);

export default router;