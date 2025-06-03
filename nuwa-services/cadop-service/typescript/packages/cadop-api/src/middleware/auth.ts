import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/sessionService.js';

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
      user?: {
        id: string;
        metadata?: Record<string, any>;
      };
    }
  }
}

/**
 * Middleware to require user authentication
 * Assumes that user authentication has been handled by Supabase Auth
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const sessionService = new SessionService();
  
  try {
    const { valid, userId, metadata } = await sessionService.validateSession(token);
    
    if (!valid || !userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 添加用户信息到请求对象
    req.user = { id: userId, metadata };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional auth middleware that doesn't fail if user is not authenticated
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  const sessionService = new SessionService();
  
  try {
    const { valid, userId, metadata } = await sessionService.validateSession(token);
    
    if (valid && userId) {
      req.user = { id: userId, metadata };
    }
  } catch (error) {
    // Ignore errors in optional auth
  }
  
  next();
}

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