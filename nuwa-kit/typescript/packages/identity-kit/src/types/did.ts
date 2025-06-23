// DID Document related type definitions

export interface VerificationMethod {
  id: string; // e.g., did:example:alice#key-1
  type: string; // e.g., Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019
  controller: string; // DID of the controller
  publicKeyMultibase?: string; // Multibase encoded public key
  publicKeyJwk?: JsonWebKey; // JWK format public key
}

export interface ServiceEndpoint {
  id: string; // e.g., did:example:alice#llm-gateway
  type: string; // Standardized service type, e.g., LLMGatewayNIP9
  serviceEndpoint: string; // URL of the service
  [key: string]: any; // Allows for additional service-specific properties
}

export interface DIDDocument {
  '@context': string | string[];
  id: string; // The DID itself
  controller?: string | string[]; // DID(s) of the controller(s)
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[]; // Array of verification method IDs or embedded verification methods
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
  [key: string]: any; // Allows for additional properties
}

export type VerificationRelationship =
  | 'authentication'
  | 'assertionMethod'
  | 'keyAgreement'
  | 'capabilityInvocation'
  | 'capabilityDelegation';

/**
 * Represents the information needed to add a new service to the DID document.
 */
export interface ServiceInfo {
  idFragment: string; // Fragment for the service id, e.g., 'my-service'
  type: string; // Standardized service type
  serviceEndpoint: string; // URL of the service
  additionalProperties?: Record<string, any>; // Other service-specific metadata
}

/**
 * Minimal resolver interface consumed by DIDAuth for DID resolution.
 * Any component (VDRRegistry, custom resolver, mock) can implement it.
 */
export interface DIDResolver {
  resolveDID(
    did: string,
    options?: {
      forceRefresh?: boolean;
    }
  ): Promise<DIDDocument | null>;
}

// DIDDocument cache interface to support pluggable caching strategies (in-memory, Redis, etc.)
export interface DIDDocumentCache {
  /**
   * Retrieve a cached DID Document, if present.
   * Returns undefined if the DID has not been cached, or null if the DID was previously
   * resolved and not found (negative-cache).
   */
  get(did: string): DIDDocument | null | undefined;

  /**
   * Store the resolution result for a DID. Allows negative-caching by passing null.
   */
  set(did: string, doc: DIDDocument | null): void;

  /**
   * Check whether a DID is present in the cache (either as a DID Document or as a negative entry).
   */
  has(did: string): boolean;

  /**
   * Delete a single DID from the cache.
   */
  delete(did: string): void;

  /**
   * Clear all cached entries.
   */
  clear(): void;
}

 