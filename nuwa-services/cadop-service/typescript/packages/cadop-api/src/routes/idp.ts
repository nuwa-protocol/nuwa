import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { createSuccessResponse } from '@cadop/shared';

const router: Router = Router();

/** In-memory issued nonces for dev; clear periodically */
const issuedNonces = new Set<string>();

router.get('/challenge', (_req: Request, res: Response) => {
  const nonce = randomUUID();
  issuedNonces.add(nonce);
  // keep the set from growing indefinitely in dev env
  if (issuedNonces.size > 5000) issuedNonces.clear();

  return res.json(createSuccessResponse({ nonce, rpId: config.webauthn.rpId }));
});

router.post('/verify', (req: Request, res: Response) => {
  const { nonce, userDid } = req.body as { nonce: string; userDid: string };
  if (!nonce || !userDid) {
    return res.status(400).json({ error: 'nonce and userDid are required' });
  }
  // simplified: skip assertion verification, only check nonce exists
  const isKnownNonce = issuedNonces.has(nonce);
  if (!isKnownNonce) {
    return res.status(400).json({ error: 'invalid nonce' });
  }
  issuedNonces.delete(nonce);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.service.did,
    sub: userDid,
    aud: config.service.did, // target custodian DID (same service in dev)
    iat: now,
    exp: now + 300,
    jti: randomUUID(),
    nonce,
    sybil_level: 0,
  };

  const signingKey = config.service.signingKey || 'dev_secret';
  const idToken = jwt.sign(payload, signingKey, { algorithm: 'HS256' });

  return res.json(createSuccessResponse({ idToken, isNewUser: false }));
});

export default router; 