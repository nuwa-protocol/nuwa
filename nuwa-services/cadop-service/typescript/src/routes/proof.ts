import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Request proof endpoint
router.post('/request', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement proof request
  res.json({ message: 'Proof Request - TODO' });
}));

// Verify proof endpoint
router.post('/verify', asyncHandler(async (_req: Request, res: Response) => {
  // TODO: Implement proof verification
  res.json({ message: 'Proof Verify - TODO' });
}));

export { router as proofRoutes }; 