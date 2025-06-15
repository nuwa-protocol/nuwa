import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

const router: Router = Router();

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



// Liveness check endpoint
router.get('/live', asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
  });
}));


export { router as healthRouter }; 