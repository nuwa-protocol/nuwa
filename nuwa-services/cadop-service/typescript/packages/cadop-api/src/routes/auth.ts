import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';
import { webauthnService } from '../services/webauthnService.js';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation.js';
import { SessionService } from '../services/sessionService.js';

const router: Router = Router();

// OIDC Discovery endpoint
router.get('/.well-known/openid-configuration', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement OIDC discovery
  res.json({ message: 'OIDC Discovery - TODO' });
}));

// JWKS endpoint
router.get('/.well-known/jwks.json', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement JWKS
  res.json({ message: 'JWKS - TODO' });
}));

// Authorization endpoint
router.get('/authorize', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement authorization
  res.json({ message: 'Authorization - TODO' });
}));

// Token endpoint
router.post('/token', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement token exchange
  res.json({ message: 'Token - TODO' });
}));

// UserInfo endpoint
router.get('/userinfo', asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'User not authenticated'
      });
    }

    const { data: user, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !user) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'User not found'
      });
    }

    return res.json({
      sub: userId,
      email: user.user.email,
      email_verified: user.user.email_confirmed_at ? true : false,
      auth_time: user.user.last_sign_in_at,
      updated_at: user.user.updated_at
    });
  } catch (error) {
    logger.error('Error fetching user info:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
}));

// Logout endpoint
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionService = new SessionService();
    const userId = req.user?.id;
    
    if (userId) {
      await sessionService.invalidateAllUserSessions(userId);
    }
    
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to logout'
    });
  }
}));

export { router as authRouter }; 