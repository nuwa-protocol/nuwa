/**
 * Internal server-side types that include authentication information
 * These types are NOT exported to clients and contain server-side context
 */

import type { 
  RecoveryRequest, 
  CommitRequest, 
  SubRavRequest, 
  ClaimTriggerRequest 
} from '../schema';

/**
 * Authentication information added by DID authentication middleware
 */
export interface DIDAuthInfo {
  did: string;
  /** Full DID key id, e.g., did:xxx#key-1 */
  keyId: string;
}

/**
 * Server-side recovery request with authentication context
 */
export interface InternalRecoveryRequest extends RecoveryRequest {
  didInfo?: DIDAuthInfo;
}

/**
 * Server-side commit request with authentication context
 */
export interface InternalCommitRequest extends CommitRequest {
  didInfo?: DIDAuthInfo;
}

/**
 * Server-side SubRAV query request with authentication context
 */
export interface InternalSubRavRequest extends SubRavRequest {
  didInfo?: DIDAuthInfo;
}

/**
 * Server-side claim trigger request with authentication context
 */
export interface InternalClaimTriggerRequest extends ClaimTriggerRequest {
  didInfo?: DIDAuthInfo;
}