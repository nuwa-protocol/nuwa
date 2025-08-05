/**
 * MCP Server Proxy - DIDAuth Module
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { DIDAuth, VDRRegistry, initRoochVDR, AuthErrorCode } from '@nuwa-ai/identity-kit';
import { DIDAuthResult } from './types.js';
import { performance } from 'node:perf_hooks';

// Symbol used to cache caller DID on a TCP socket once it has been verified.
const SOCKET_DID_KEY = Symbol('callerDid');

// Initialize VDR Registry with default VDRs
const registry = VDRRegistry.getInstance();
// Ensure rooch VDR is registered
initRoochVDR('test', undefined, registry);

/**
 * Extracts the authorization header from a Fastify request
 */
export function extractAuthHeader(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  return header;
}

/**
 * Verifies a DIDAuth header
 * @param authHeader The authorization header value
 * @returns DIDAuth verification result
 */
export async function verifyDIDAuth(authHeader: string): Promise<DIDAuthResult> {
  try {
    const prefix = 'DIDAuthV1 ';
    if (!authHeader || !authHeader.startsWith(prefix)) {
      return { 
        isValid: false, 
        did: '', 
        error: 'Missing or invalid DIDAuthV1 header' 
      };
    }

    const verify = await DIDAuth.v1.verifyAuthHeader(authHeader, registry);
    if (!verify.ok) {
      // Check for specific error codes that we want to temporarily ignore
      if (verify.errorCode === AuthErrorCode.NONCE_REPLAYED) {
        console.warn('Ignoring nonce replay error for development/testing:', verify.error);
        // Extract DID from signedObject even though verification failed
        if (verify.signedObject) {
          const signerDid = verify.signedObject.signature.signer_did;
          return { 
            isValid: true, 
            did: signerDid,
            warning: `Ignored nonce replay: ${verify.error}`
          };
        }
      }
      
      if (verify.errorCode === AuthErrorCode.TIMESTAMP_OUT_OF_WINDOW) {
        console.warn('Ignoring timestamp error for development/testing:', verify.error);
        // Extract DID from signedObject even though verification failed
        if (verify.signedObject) {
          const signerDid = verify.signedObject.signature.signer_did;
          return { 
            isValid: true, 
            did: signerDid,
            warning: `Ignored timestamp error: ${verify.error}`
          };
        }
      }

      // For other errors, fail the verification
      console.error('DIDAuth verification failed:', {
        errorCode: verify.errorCode,
        error: verify.error,
        header: authHeader.substring(0, 50) + '...' // truncate for logging
      });
      
      return { 
        isValid: false, 
        did: '', 
        error: `DIDAuth verification failed [${verify.errorCode}]: ${verify.error}` 
      };
    }
    
    const signerDid = verify.signedObject.signature.signer_did;
    return { 
      isValid: true, 
      did: signerDid 
    };
  } catch (error) {
    console.error('DIDAuth verification exception:', error);
    return { 
      isValid: false, 
      did: '', 
      error: `DIDAuth verification error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * Fastify middleware to authenticate requests using DIDAuth
 */
export async function didAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const t0 = performance.now();
  // Each Fastify request has a raw Node socket; reuse DID cached there to avoid
  // verifying the same DIDAuth header for every message on a long-lived connection
  const sock = request.raw.socket as any;

  // If this socket was verified before, reuse the cached DID and skip verification
  if (sock[SOCKET_DID_KEY]) {
    console.debug('request '+ request.id +' reuse cached DID', sock[SOCKET_DID_KEY]);
    request.ctx = {
      ...request.ctx,
      callerDid: sock[SOCKET_DID_KEY] as string,
    };
    if (request.ctx && request.ctx.timings) {
      request.ctx.timings.auth = Number((performance.now() - t0).toFixed(3));
    }
    return; // already authenticated
  }

  const authHeader = extractAuthHeader(request);
  
  if (!authHeader) {
    if (request.ctx && request.ctx.timings) {
      request.ctx.timings.auth = Number((performance.now() - t0).toFixed(3));
    }
    return reply
      .status(401)
      .send({ error: 'Missing Authorization header' });
  }
  const result = await verifyDIDAuth(authHeader);
  console.debug('request '+ request.id +' verifyDIDAuth result', result);
  if (!result.isValid) {
    if (request.ctx && request.ctx.timings) {
      request.ctx.timings.auth = Number((performance.now() - t0).toFixed(3));
    }
    return reply
      .status(403)
      .send({ error: result.error || 'DIDAuth verification failed' });
  }

  // Cache DID on socket so subsequent requests over the same connection skip verification
  sock[SOCKET_DID_KEY] = result.did;

  // Store the authenticated DID in request context
  request.ctx = {
    ...request.ctx,
    callerDid: result.did,
  };
  if (request.ctx && request.ctx.timings) {
    request.ctx.timings.auth = Number((performance.now() - t0).toFixed(3));
  }
} 