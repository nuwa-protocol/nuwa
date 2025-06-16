import { Router, Request, Response } from 'express';
import { createSuccessResponse } from '@cadop/shared';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { PublicKeyCredentialJSON } from '@simplewebauthn/types';

const router: Router = Router();

router.get('/challenge', async (_req: Request, res: Response) => {
  const serviceContainer = await ServiceContainer.getInstance();
  const idpService = serviceContainer.getIdpService();
  const response = idpService.generateChallenge();
  return res.json(createSuccessResponse(response));
});

router.post('/verify-assertion', async (req: Request, res: Response) => {
  const { assertion, userDid, nonce } = req.body as { 
    assertion: PublicKeyCredentialJSON; 
    userDid: string; 
    nonce: string 
  };
  
  const serviceContainer = await ServiceContainer.getInstance();
  const idpService = serviceContainer.getIdpService();
  
  try {
    const response = await idpService.verifyAssertion(assertion, userDid, nonce);
    return res.json(createSuccessResponse(response));
  } catch (error) {
    console.error('Assertion verification error:', error);
    return res.status(400).json({ error: (error as Error).message });
  }
});

export default router; 