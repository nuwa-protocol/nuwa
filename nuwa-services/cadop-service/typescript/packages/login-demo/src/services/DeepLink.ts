/**
 * DeepLink - Utilities for building deep-link URLs to CADOP Web
 */
import { CryptoUtils } from '@nuwa-ai/identity-kit';
import { encodeBase64Url } from '../utils/base64';

export interface AddKeyPayload {
  version: number;
  agentDid?: string;
  verificationMethod: {
    type: string;
    publicKeyMultibase?: string;
    publicKeyJwk?: Record<string, unknown>;
    idFragment?: string;
  };
  verificationRelationships: string[];
  redirectUri: string;
  state: string;
}

export const DEFAULT_CADOP_DOMAIN = 'test-id.nuwa.dev';

export function getCadopDomain(): string {
  return localStorage.getItem('nuwa-login-demo:cadop-domain') || DEFAULT_CADOP_DOMAIN;
}

export function setCadopDomain(domain: string): void {
  localStorage.setItem('nuwa-login-demo:cadop-domain', domain);
}

/**
 * Build a deep-link URL to add a key to an Agent DID
 * @param publicKey - Raw public key bytes
 * @param options - Optional parameters
 * @returns Full deep-link URL
 */
export async function buildAddKeyUrl(
  publicKey: Uint8Array,
  options: {
    agentDid?: string;
    keyType?: string;
    idFragment?: string;
    relationships?: string[];
    redirectPath?: string;
    cadopDomain?: string;
  } = {}
): Promise<string> {
  const {
    agentDid,
    keyType = 'Ed25519VerificationKey2020',
    idFragment = `key-${Date.now()}`,
    relationships = ['authentication'],
    redirectPath = '/callback',
    cadopDomain = getCadopDomain(),
  } = options;

  // Convert public key to multibase format
  const publicKeyMultibase = CryptoUtils.publicKeyToMultibase(publicKey, keyType);

  // Create a random state for CSRF protection
  const state = crypto.randomUUID();

  // Build the complete redirect URI
  const redirectUri = new URL(redirectPath, window.location.origin).toString();

  // Construct the payload
  const payload: AddKeyPayload = {
    version: 1,
    verificationMethod: {
      type: keyType,
      publicKeyMultibase,
      idFragment,
    },
    verificationRelationships: relationships,
    redirectUri,
    state,
  };

  // Add optional agentDid if provided
  if (agentDid) {
    payload.agentDid = agentDid;
  }

  // Encode the payload as Base64URL
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));

  let fullUrl: string;

  if (cadopDomain.startsWith('http://') || cadopDomain.startsWith('https://')) {
    fullUrl = `${cadopDomain}/add-key?payload=${encodedPayload}`;
  } else {
    const protocol = cadopDomain.includes('localhost') || 
                    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(cadopDomain) 
                    ? 'http://' : 'https://';
    fullUrl = `${protocol}${cadopDomain}/add-key?payload=${encodedPayload}`;
  }

  return fullUrl;
}

/**
 * Generate a new Ed25519 key pair and build a deep-link URL
 * @param options - Optional parameters
 * @returns Object containing the key pair and deep-link URL
 */
export async function generateKeyAndBuildUrl(options: {
  agentDid?: string;
  idFragment?: string;
  relationships?: string[];
  redirectPath?: string;
  cadopDomain?: string;
} = {}): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  url: string;
}> {
  // Generate a new Ed25519 key pair
  const { publicKey, privateKey } = await CryptoUtils.generateKeyPair('Ed25519VerificationKey2020');

  // Build the deep-link URL
  const url = await buildAddKeyUrl(publicKey, options);

  return { publicKey, privateKey, url };
} 