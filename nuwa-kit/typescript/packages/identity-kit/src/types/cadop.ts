// CADOP (Custodian-Assisted DID Onboarding Protocol) related types

import { AuthMethod, SybilLevel } from './auth';

/**
 * Metadata for CadopCustodianService
 */
export interface CadopCustodianServiceMetadata {
  name?: string;
  auth_methods?: AuthMethod[];
  sybilLevel?: SybilLevel;
  maxDailyMints?: number;
}

/**
 * Metadata for CadopIdPService (Identity Provider)
 */
export interface CadopIdPServiceMetadata {
  name?: string;
  jwks_uri: string; // REQUIRED
  issuer_did?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
}

/**
 * Metadata for Web2ProofServiceCADOP
 */
export interface Web2ProofServiceMetadata {
  name?: string;
  accepts?: string[]; // Types of Web2 proofs accepted
  supportedClaims?: string[]; // Types of claims/VCs this service can issue
}

/**
 * CADOP service types
 */
export const CADOP_SERVICE_TYPES = {
  CUSTODIAN: 'CadopCustodianService',
  IDENTITY_PROVIDER: 'CadopIdPService',
  WEB2_PROOF: 'Web2ProofServiceCADOP',
} as const;

/**
 * CADOP onboarding request payload
 */
export interface CadopOnboardingRequest {
  userDID: string; // User's client-generated DID (e.g., did:key)
  initialAgentKey_pub: JsonWebKey | Uint8Array; // Public key material
  idToken: string; // ID Token from CadopIdPService
  web2ProofAttestations?: string[]; // Optional additional VCs from Web2ProofService
}

/**
 * CADOP onboarding response
 */
export interface CadopOnboardingResponse {
  success: boolean;
  agentDID?: string; // Final Agent DID (if newly created)
  transactionHash?: string; // On-chain transaction hash (if applicable)
  error?: string;
} 