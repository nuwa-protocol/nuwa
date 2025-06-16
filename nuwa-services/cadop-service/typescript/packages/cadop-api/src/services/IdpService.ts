import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

/** In-memory issued nonces for dev; clear periodically */
const issuedNonces = new Set<string>();

export interface IdpServiceConfig {
  cadopDid: string;
  signingKey: string;
  rpId: string;
}

export interface ChallengeResponse {
  nonce: string;
  rpId: string;
}

export interface VerifyResponse {
  idToken: string;
  isNewUser: boolean;
}

export class IdpService {
  private config: IdpServiceConfig;

  constructor(config: IdpServiceConfig) {
    this.config = config;
  }

  generateChallenge(): ChallengeResponse {
    const nonce = randomUUID();
    issuedNonces.add(nonce);
    // keep the set from growing indefinitely in dev env
    if (issuedNonces.size > 5000) issuedNonces.clear();

    return { nonce, rpId: this.config.rpId };
  }

  verifyNonce(nonce: string, userDid: string): VerifyResponse {
    if (!nonce || !userDid) {
      throw new Error('nonce and userDid are required');
    }

    // simplified: skip assertion verification, only check nonce exists
    const isKnownNonce = issuedNonces.has(nonce);
    if (!isKnownNonce) {
      throw new Error('invalid nonce');
    }
    issuedNonces.delete(nonce);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.config.cadopDid,
      sub: userDid,
      aud: this.config.cadopDid, // target custodian DID (same service in dev)
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
      nonce,
      sybil_level: 0,
    };

    const idToken = jwt.sign(payload, this.config.signingKey, { algorithm: 'HS256' });

    return { idToken, isNewUser: false };
  }
} 