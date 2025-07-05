/**
 * MCP Server Proxy - DIDAuth Module
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { DIDAuth, VDRRegistry, initRoochVDR } from '@nuwa-ai/identity-kit';
import { DIDAuthResult } from './types.js';

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
      const msg = (verify as { error: string }).error;
      return { 
        isValid: false, 
        did: '', 
        error: `Invalid DIDAuth: ${msg}` 
      };
    }
    
    const signerDid = verify.signedObject.signature.signer_did;
    return { 
      isValid: true, 
      did: signerDid 
    };
  } catch (error) {
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
  const t0 = Date.now();
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
    request.ctx.timings.auth = Date.now() - t0;
    return; // already authenticated
  }

  const authHeader = extractAuthHeader(request);
  
  if (!authHeader) {
    request.ctx.timings.auth = Date.now() - t0;
    return reply
      .status(401)
      .send({ error: 'Missing Authorization header' });
  }
  const result = await verifyDIDAuth(authHeader);
  console.debug('request '+ request.id +' verifyDIDAuth result', result);
  if (!result.isValid) {
    request.ctx.timings.auth = Date.now() - t0;
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
  request.ctx.timings.auth = Date.now() - t0;
} 