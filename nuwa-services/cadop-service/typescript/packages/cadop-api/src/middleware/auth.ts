import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/SessionService.js';
import { logger } from '../utils/logger.js';
import rateLimit from 'express-rate-limit';
import { config } from '../config/environment.js';
import { SessionRecord } from '../repositories/sessions.js';
import { UserRecord } from '../repositories/users.js';

class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Create an authentication limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 100, // 100 requests per IP
  message: { error: 'Too many authentication attempts, please try again later' }
});

/**
 * Extract and validate authentication token
 */
function extractToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('INVALID_TOKEN', 'No bearer token provided');
  }
  return authHeader.split(' ')[1];
}

/**
 * Validate session and inject user information
 */
async function validateAndInjectSession(
  req: Request,
  token: string,
  required: boolean = true
): Promise<void> {
  const sessionService = new SessionService();
  
  try {
    const { valid, session, user } = await sessionService.validateSession(token);
    
    if (!valid || !user || !session) {
      if (required) {
        throw new AuthError('INVALID_SESSION', 'Invalid or expired session');
      }
      return;
    }

    // Inject user information
    req.user = user;
    req.session = session;

  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('AUTH_ERROR', 'Authentication failed');
  }
}

/**
 * Required authentication middleware
 */
export const requireAuth = [
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      await validateAndInjectSession(req, token);
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({ 
          error: error.code,
          message: error.message 
        });
      } else {
        logger.error('Authentication error', { error });
        res.status(500).json({ 
          error: 'INTERNAL_ERROR',
          message: 'Internal server error' 
        });
      }
    }
  }
];

/**
 * Optional authentication middleware
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await validateAndInjectSession(req, token, false);
    }
  } catch (error) {
    logger.warn('Optional auth failed', { error });
  }
  next();
};

/**
 * Admin authentication middleware
 */
export const requireAdmin = [
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.metadata?.isAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Admin privileges required'
      });
    }
    next();
  }
];

/**
 * Session cleanup middleware
 * Used to perform necessary cleanup work after a request
 */
export const sessionCleanup = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.on('finish', async () => {
    if (req.session) {
      try {
        const sessionService = new SessionService();
        // If the response status code indicates an invalid session, clean it up
        if (res.statusCode === 401) {
          await sessionService.invalidateSession(req.session.id);
          logger.debug('Session invalidated', { sessionId: req.session.id });
        }
      } catch (error) {
        logger.error('Session cleanup error', { error });
      }
    }
  });
  next();
}; 