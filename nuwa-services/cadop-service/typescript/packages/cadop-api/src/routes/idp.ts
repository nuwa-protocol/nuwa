import { Router, Request, Response } from 'express';
import { createSuccessResponse } from '@cadop/shared';
import { ServiceContainer } from '../services/ServiceContainer.js';

const router: Router = Router();

router.get('/challenge', async (_req: Request, res: Response) => {
  const serviceContainer = await ServiceContainer.getInstance();
  const idpService = serviceContainer.getIdpService();
  const response = idpService.generateChallenge();
  return res.json(createSuccessResponse(response));
});

router.post('/verify', async (req: Request, res: Response) => {
  const { nonce, userDid } = req.body as { nonce: string; userDid: string };
  const serviceContainer = await ServiceContainer.getInstance();
  const idpService = serviceContainer.getIdpService();
  
  try {
    const response = idpService.verifyNonce(nonce, userDid);
    return res.json(createSuccessResponse(response));
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

export default router; 