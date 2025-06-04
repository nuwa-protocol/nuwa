import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { WebAuthnService } from '../services/webauthnService.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import jwt from 'jsonwebtoken';
import { SessionService } from '../services/sessionService.js';
import { DatabaseService } from '../services/database.js';
import crypto from 'crypto';
import cbor from 'cbor';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import {
  verifySchema,
  authenticationOptionsSchema,
  credentialSchema,
  WebAuthnError,
  WebAuthnErrorCode,
} from '@cadop/shared';

/**
 * Base64URL 编码工具函数
 */
function base64urlEncode(buffer: Buffer): string {
  const base64 = buffer.toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// 辅助函数：解析认证器数据
function parseAuthenticatorData(buffer: Buffer) {
  let pos = 0;
  const rpIdHash = buffer.slice(pos, pos + 32); pos += 32;
  const flagsBuf = buffer.slice(pos, pos + 1); pos += 1;
  const flags = flagsBuf[0];
  const counterBuf = buffer.slice(pos, pos + 4); pos += 4;
  const counter = counterBuf.readUInt32BE(0);
  
  let aaguid: Buffer | undefined;
  let credentialId: Buffer | undefined;
  let credentialPublicKey: Buffer | undefined;

  if (flags & 0x40) { // Check if attestation data is included
    aaguid = buffer.slice(pos, pos + 16); pos += 16;
    const credentialIdLength = buffer.slice(pos, pos + 2).readUInt16BE(0); pos += 2;
    credentialId = buffer.slice(pos, pos + credentialIdLength); pos += credentialIdLength;
    credentialPublicKey = buffer.slice(pos);
  }

  return {
    rpIdHash,
    flags,
    counter,
    aaguid,
    credentialId,
    credentialPublicKey
  };
}

const router: Router = Router();
const webauthnService = new WebAuthnService();

const removeDeviceSchema = z.object({
  params: z.object({
    deviceId: z.string().uuid(),
  }),
});

// Add WebAuthn configuration endpoint
router.get('/.well-known/webauthn', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    version: '1.0',
    rp: {
      id: process.env.WEBAUTHN_RP_ID || 'localhost',
      name: process.env.WEBAUTHN_RP_NAME || 'CADOP Service',
      icon: `${process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'}/favicon.ico`
    }
  });
});

/**
 * POST /api/webauthn/options
 * Generate WebAuthn authentication options
 */
router.post(
  '/options',
  validateRequest(authenticationOptionsSchema),
  async (req: Request, res: Response) => {
    try {
      const { user_did, name, display_name } = req.body;
      const options = await webauthnService.generateAuthenticationOptions(user_did, {
        name,
        displayName: display_name
      });

      res.json({
        success: true,
        ...options
      });
    } catch (error) {
      logger.error('Failed to generate authentication options', { error });
      if (error instanceof WebAuthnError) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: WebAuthnErrorCode.INTERNAL_ERROR
        });
      }
    }
  }
);

/**
 * POST /api/webauthn/verify
 * Verify WebAuthn registration or authentication response
 */
router.post(
  '/verify',
  validateRequest(verifySchema),
  async (req: Request, res: Response) => {
    try {
      const result = await webauthnService.verifyAuthenticationResponse(req.body.response);
      res.json(result);
    } catch (error) {
      logger.error('Failed to verify authentication response', { error });
      if (error instanceof WebAuthnError) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: WebAuthnErrorCode.INTERNAL_ERROR
        });
      }
    }
  }
);

/**
 * GET /api/webauthn/credentials
 * Get user's registered WebAuthn credentials
 */
router.get(
  '/credentials',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const credentials = await webauthnService.getUserCredentials(req.user!.id);
      res.json({
        success: true,
        credentials
      });
    } catch (error) {
      logger.error('Failed to get user credentials', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to get credentials',
        code: WebAuthnErrorCode.INTERNAL_ERROR
      });
    }
  }
);

/**
 * DELETE /api/webauthn/credentials/:id
 * Remove a WebAuthn credential
 */
router.delete(
  '/credentials/:id',
  requireAuth,
  validateRequest(credentialSchema),
  async (req: Request, res: Response) => {
    try {
      const success = await webauthnService.removeCredential(
        req.user!.id,
        req.params.id
      );
      res.json({ success });
    } catch (error) {
      logger.error('Failed to remove credential', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to remove credential',
        code: WebAuthnErrorCode.INTERNAL_ERROR
      });
    }
  }
);

/**
 * POST /api/webauthn/cleanup
 * Cleanup expired challenges (admin endpoint)
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const count = await webauthnService.cleanupExpiredChallenges();
    res.json({
      success: true,
      count
    });
  } catch (error) {
    logger.error('Failed to cleanup challenges', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup challenges',
      code: WebAuthnErrorCode.INTERNAL_ERROR
    });
  }
});

// 废弃的接口
/**
 * @deprecated Use /webauthn/options instead
 */
router.post('/authentication/options', (req: Request, res: Response) => {
  logger.warn('Using deprecated endpoint: /authentication/options');
  res.redirect(307, '/webauthn/options');
});

/**
 * @deprecated Use /webauthn/options instead
 */
router.post('/register/begin', (req: Request, res: Response) => {
  logger.warn('Using deprecated endpoint: /register/begin');
  res.redirect(307, '/webauthn/options');
});

/**
 * @deprecated Use /webauthn/options instead
 */
router.post('/authenticate/begin', (req: Request, res: Response) => {
  logger.warn('Using deprecated endpoint: /authenticate/begin');
  res.redirect(307, '/webauthn/options');
});

/**
 * @deprecated Use /webauthn/credentials instead
 */
router.get('/devices', requireAuth, (req: Request, res: Response) => {
  logger.warn('Using deprecated endpoint: /devices');
  res.redirect(307, '/webauthn/credentials');
});

/**
 * @deprecated Use /webauthn/credentials/:id instead
 */
router.delete('/devices/:deviceId', requireAuth, (req: Request, res: Response) => {
  logger.warn('Using deprecated endpoint: /devices/:deviceId');
  res.redirect(307, `/webauthn/credentials/${req.params.deviceId}`);
});

router.get('/test', (req: Request, res: Response) => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const rpID = req.hostname;
  
  return res.json({
    isWebAuthnSupported: true,
    isSecureContext: isSecure,
    rpID,
    origin: `${req.protocol}://${req.get('host')}`,
    userAgent: req.headers['user-agent'],
    features: {
      publicKeyCredential: 'Available in browser',
      conditionalMediation: 'Check browser support'
    },
    redirectTo: process.env['FRONTEND_URL'] || 'http://localhost:3000',
  });
});

// 开发环境专用路由
if (process.env.NODE_ENV !== 'production') {
  /**
   * POST /api/webauthn/dev/reset-counter
   * 重置指定认证器的counter（仅开发环境）
   */
  router.post('/dev/reset-counter', async (req: Request, res: Response) => {
    try {
      const { credentialId } = req.body;
      
      if (!credentialId) {
        return res.status(400).json({
          error: 'credentialId is required',
          code: 'MISSING_CREDENTIAL_ID',
        });
      }

      const result = await webauthnService.resetAuthenticatorCounter(credentialId);
      
      if (result) {
        logger.info('Authenticator counter reset successfully', { credentialId });
        res.json({ success: true, message: 'Counter reset successfully' });
      } else {
        res.status(500).json({
          error: 'Failed to reset counter',
          code: 'RESET_FAILED',
        });
      }
    } catch (error) {
      logger.error('Failed to reset authenticator counter', { error });
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  /**
   * POST /api/webauthn/dev/reset-user-counters
   * 重置用户所有认证器的counter（仅开发环境）
   */
  router.post('/dev/reset-user-counters', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
      }

      const resetCount = await webauthnService.resetUserAuthenticatorCounters(userId);
      
      logger.info('User authenticator counters reset successfully', { userId, resetCount });
      res.json({ 
        success: true, 
        message: `Reset ${resetCount} authenticator counters`,
        resetCount 
      });
    } catch (error) {
      logger.error('Failed to reset user authenticator counters', { error });
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}

export default router; 