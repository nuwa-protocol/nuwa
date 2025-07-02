/**
 * MCP Server Proxy - DIDAuth Module
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { DIDAuth, VDRRegistry, initRoochVDR } from '@nuwa-ai/identity-kit';
import { DIDAuthResult } from './types.js';

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
  const authHeader = extractAuthHeader(request);
  
  if (!authHeader) {
    return reply
      .status(401)
      .send({ error: 'Missing Authorization header' });
  }

  const result = await verifyDIDAuth(authHeader);
  
  if (!result.isValid) {
    return reply
      .status(403)
      .send({ error: result.error || 'DIDAuth verification failed' });
  }

  // Store the authenticated DID in request context
  request.ctx = {
    ...request.ctx,
    callerDid: result.did,
  };
} 