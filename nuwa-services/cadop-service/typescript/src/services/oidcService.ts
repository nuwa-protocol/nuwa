import { verify } from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface IDTokenPayload {
  iss: string; // Issuer
  sub: string; // Subject (User ID)
  aud: string; // Audience (Client ID)
  exp: number; // Expiration time
  iat: number; // Issued at
  did?: string; // User DID (optional)
  email?: string; // User email (optional)
  sybil_level?: number; // Sybil level (optional)
  [key: string]: any; // Other claims
}

/**
 * Validate ID Token validity
 */
export async function validateIdToken(idToken: string): Promise<IDTokenPayload | null> {
  try {
    if (!idToken) {
      logger.warn('ID Token is empty');
      return null;
    }

    // Get JWT secret
    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return null;
    }

    // Verify JWT Token
    const payload = verify(idToken, jwtSecret, {
      algorithms: ['HS256'],
      issuer: process.env['OIDC_ISSUER'] || 'https://localhost:3000',
      // Can add more verification options
    }) as IDTokenPayload;

    // Verify required claims
    if (!payload.sub) {
      logger.warn('ID Token missing required sub claim');
      return null;
    }

    if (!payload.aud) {
      logger.warn('ID Token missing required aud claim');
      return null;
    }

    // Check expiration time
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      logger.warn('ID Token has expired');
      return null;
    }

    logger.info('ID Token validated successfully', {
      sub: payload.sub,
      aud: payload.aud,
      iat: payload.iat,
      exp: payload.exp
    });

    return payload;

  } catch (error) {
    logger.error('ID Token validation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      idToken: idToken.substring(0, 50) + '...' // Only log first 50 characters of token
    });
    return null;
  }
}

/**
 * Create ID Token (for testing)
 */
export function createIdToken(payload: Partial<IDTokenPayload>): string {
  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  const jwt = require('jsonwebtoken');
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: IDTokenPayload = {
    iss: process.env['OIDC_ISSUER'] || 'https://localhost:3000',
    aud: payload.aud || 'default-client',
    sub: payload.sub || 'test-user',
    iat: now,
    exp: now + 3600, // Expires in 1 hour
    ...payload
  };

  return jwt.sign(fullPayload, jwtSecret, { algorithm: 'HS256' });
}

/**
 * Parse ID Token (without signature verification)
 */
export function decodeIdToken(idToken: string): IDTokenPayload | null {
  try {
    const jwt = require('jsonwebtoken');
    return jwt.decode(idToken) as IDTokenPayload;
  } catch (error) {
    logger.error('Failed to decode ID Token', { error });
    return null;
  }
} 