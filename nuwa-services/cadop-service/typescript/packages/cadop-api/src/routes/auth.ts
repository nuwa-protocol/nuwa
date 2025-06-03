import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/environment.js';
import { webauthnService } from '../services/webauthnService.js';

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

// WebAuthn login initialization
router.post('/login/webauthn/begin', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !users) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'User not found'
      });
    }
    
    // Generate authentication options with user ID
    const options = await webauthnService.generateAuthenticationOptions(users.id);
    
    return res.json({
      success: true,
      options
    });
  } catch (error) {
    logger.error('WebAuthn login initialization error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to initialize WebAuthn login'
    });
  }
}));

// WebAuthn login completion
router.post('/login/webauthn/complete', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { response } = req.body;
    
    // Verify the authentication response
    const result = await webauthnService.verifyAuthenticationResponse(response);
    
    if (!result.success) {
      return res.status(401).json({
        error: 'authentication_failed',
        error_description: result.error || 'Authentication failed'
      });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(result.user_id!);
    if (userError || !user) {
      throw new Error('User not found');
    }

    // Create session using Supabase auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: user.user.email!,
      password: result.user_id! // Use user_id as a temporary password
    });

    if (authError) {
      throw authError;
    }

    return res.json({
      success: true,
      session: authData.session
    });
  } catch (error) {
    logger.error('WebAuthn login completion error:', error);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to complete WebAuthn login'
    });
  }
}));

// Logout endpoint
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      await supabase.auth.admin.signOut(userId);
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