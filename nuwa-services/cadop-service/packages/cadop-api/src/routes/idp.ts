import { Router, Request, Response } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
  CadopErrorCode,
  ChallengeRequestSchema,
  BitcoinVerifyRequestSchema,
  AuthProvider,
} from '@cadop/shared';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { PublicKeyCredentialJSON } from '@simplewebauthn/types';
import { validateQuery, validateRequest } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';

const router: Router = Router();

router.get(
  '/challenge',
  validateQuery(ChallengeRequestSchema),
  async (req: Request, res: Response) => {
    try {
      const { provider } = req.query as { provider?: AuthProvider };

      const serviceContainer = await ServiceContainer.getInstance();
      const idpService = serviceContainer.getIdpService();
      const response = idpService.generateChallenge(provider || 'webauthn');

      logger.info('Challenge generated', { provider: provider || 'webauthn' });
      return res.json(createSuccessResponse(response));
    } catch (error) {
      logger.error('Challenge generation failed', { error });
      return res
        .status(500)
        .json(createErrorResponse('Failed to generate challenge', CadopErrorCode.INTERNAL_ERROR));
    }
  }
);

router.post('/verify-assertion', async (req: Request, res: Response) => {
  const { assertion, userDid, nonce, rpId, origin } = req.body as {
    assertion: PublicKeyCredentialJSON;
    userDid: string;
    nonce: string;
    rpId: string;
    origin: string;
  };

  const serviceContainer = await ServiceContainer.getInstance();
  const idpService = serviceContainer.getIdpService();

  try {
    const response = await idpService.verifyAssertion(assertion, userDid, nonce, rpId, origin);
    return res.json(createSuccessResponse(response));
  } catch (error) {
    console.error('Assertion verification error:', error);
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.post(
  '/verify-bitcoin',
  validateRequest(BitcoinVerifyRequestSchema),
  async (req: Request, res: Response) => {
    try {
      const serviceContainer = await ServiceContainer.getInstance();
      const idpService = serviceContainer.getIdpService();

      logger.info('Bitcoin verification request received', {
        address: req.body.address,
        network: req.body.network,
        hasSignature: !!req.body.signature,
      });

      const response = await idpService.verifyBitcoinSignature(req.body);

      logger.info('Bitcoin verification successful', {
        address: req.body.address,
        network: req.body.network,
      });

      return res.json(createSuccessResponse(response));
    } catch (error) {
      logger.error('Bitcoin verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        address: req.body?.address,
        network: req.body?.network,
      });

      return res
        .status(400)
        .json(
          createErrorResponse(
            error instanceof Error ? error.message : 'Bitcoin verification failed',
            CadopErrorCode.AUTHENTICATION_FAILED
          )
        );
    }
  }
);

export default router;
