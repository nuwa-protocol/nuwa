import { KeyType } from './crypto';

/**
 * VerificationMethod info sent in deep-link add-key request.
 */
export interface VerificationMethodInput {
  /**
   * Verification key suite. Should be one of the KeyType enum values.
   */
  type: KeyType;
  /** Multibase-encoded public key */
  publicKeyMultibase: string;
  /** Suggested fragment for the verification method id */
  idFragment: string;
}

/**
 * Add-key request payload (v1) for Cadop deep-link protocol.
 *
 * NOTE: Located in the core package so that web / mobile / server implementations can reuse the same type.
 */
export interface AddKeyRequestPayloadV1 {
  /** Protocol version – always 1 for the current specification */
  version: 1;
  /** Verification method details for the key being added */
  verificationMethod: VerificationMethodInput;
  /** DID document relationships to attach the new key to */
  verificationRelationships: string[];
  /** Absolute callback URL handled on browser side */
  redirectUri: string;
  /** Random string used for CSRF protection */
  state: string;
  /** Target Agent DID, optional */
  agentDid?: string;
}

/**
 * Union of all supported payload versions. Placed here for future expansion.
 */
export type AddKeyRequestPayload = AddKeyRequestPayloadV1; 