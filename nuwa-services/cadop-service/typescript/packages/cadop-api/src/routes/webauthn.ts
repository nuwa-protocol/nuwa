import { Router, Request, Response } from 'express';
import { WebAuthnService } from '../services/WebAuthnService.js';
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

const router: Router = Router();
const webauthnService = new WebAuthnService();

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
router.get('/.well-known/webauthn', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(createSuccessResponse({
    version: '1.0',
    rp: {
      id: process.env.WEBAUTHN_RP_ID || 'localhost',
      name: process.env.WEBAUTHN_RP_NAME || 'CADOP Service',
      icon: `${process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'}/favicon.ico`
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
      const { user_did, name, display_name } = req.body;
      const options = await webauthnService.generateAuthenticationOptions(user_did, {
        name,
        displayName: display_name
      });

      res.json(createSuccessResponse(options));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
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
      const result = await webauthnService.verifyAuthenticationResponse(req.body.response);
      res.json(createSuccessResponse(result));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
    }
  }
);

/**
 * GET /api/webauthn/credentials
 * Get user's registered WebAuthn credentials
 */
router.get(
  '/credentials',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const credentials = await webauthnService.getUserCredentials(req.user!.id);
      res.json(createSuccessResponse({ credentials }));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
    }
  }
);

/**
 * DELETE /api/webauthn/credentials/:id
 * Remove a WebAuthn credential
 */
router.delete(
  '/credentials/:id',
  requireAuth,
  validateRequest(credentialSchema),
  async (req: Request, res: Response) => {
    try {
      const success = await webauthnService.removeCredential(
        req.user!.id,
        req.params.id
      );
      res.json(createSuccessResponse({ success }));
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

      const idToken = await webauthnService.getIdToken(req.user!.id);
      res.json(createSuccessResponse(idToken));
    } catch (error) {
      const { status, response } = handleError(error);
      res.status(status).json(response);
    }
  }
);

export default router;