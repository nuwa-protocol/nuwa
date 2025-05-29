import { Request, Response, NextFunction } from 'express';

// 定义自定义的 User 类型，包含我们需要的属性
interface CustomUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: CustomUser;
    }
  }
}

/**
 * Middleware to require user authentication
 * Assumes that user authentication has been handled by Supabase Auth
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
    });
    return;
  }
  
  next();
};

/**
 * Optional auth middleware that doesn't fail if user is not authenticated
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  // User may or may not be present, but continue regardless
  next();
};

/**
 * Middleware to extract user from Supabase session
 * This should be used before requireAuth
 */
export const extractUser = (req: Request, res: Response, next: NextFunction): void => {
  // In a real implementation, this would extract the user from JWT token
  // For now, we'll set a placeholder that can be populated by Supabase middleware
  
  // The actual user extraction should be handled by Supabase Auth middleware
  // This is just a placeholder to satisfy TypeScript
  
  next();
}; 