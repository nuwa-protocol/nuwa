import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { supabase } from '../config/supabase.js';

const router: Router = Router();

// Database health check function
async function checkDatabaseHealth(): Promise<{ status: string; details?: any }> {
  try {
    // Simple connection test using user_profiles table
    const { error } = await supabase
      .from('user_profiles')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      return { 
        status: 'ERROR', 
        details: { message: error.message, code: error.code } 
      };
    }
    
    return { 
      status: 'OK',
      details: { tablesAccessible: true, connectionTime: new Date().toISOString() }
    };
  } catch (error) {
    return { 
      status: 'ERROR', 
      details: { message: (error as Error).message } 
    };
  }
}

// Rooch network health check function
async function checkRoochNetworkHealth(): Promise<{ status: string; details?: any }> {
  try {
    // Simple network connectivity test
    // TODO: Implement actual Rooch network check when nuwa-identity-kit is available
    return { 
      status: 'OK',
      details: { message: 'Network check not implemented yet' }
    };
  } catch (error) {
    return { 
      status: 'ERROR', 
      details: { message: (error as Error).message } 
    };
  }
}

// Health check endpoint
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env['NODE_ENV'] || 'development',
    version: process.env['npm_package_version'] || '1.0.0',
  };

  res.status(200).json(healthCheck);
}));

// Readiness check endpoint
router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  const checks = {
    database: await checkDatabaseHealth(),
    roochNetwork: await checkRoochNetworkHealth(),
  };

  const allHealthy = Object.values(checks).every(check => check.status === 'OK');
  
  const readinessCheck = {
    status: allHealthy ? 'READY' : 'NOT_READY',
    timestamp: new Date().toISOString(),
    checks,
  };

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(readinessCheck);
}));

// Liveness check endpoint
router.get('/live', asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
  });
}));

// Database status endpoint
router.get('/database', asyncHandler(async (_req: Request, res: Response) => {
  const dbCheck = await checkDatabaseHealth();
  const statusCode = dbCheck.status === 'OK' ? 200 : 503;
  
  res.status(statusCode).json({
    ...dbCheck,
    timestamp: new Date().toISOString(),
  });
}));

export { router as healthRouter }; 