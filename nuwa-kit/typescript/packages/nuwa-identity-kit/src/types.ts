// Using the DOM's JsonWebKey interface directly
// No need to redefine it here, TypeScript already knows about it
// from lib.dom.d.ts when "lib": ["dom"] is in tsconfig.json

export interface VerificationMethod {
  id: string; // e.g., did:example:alice#key-1
  type: string; // e.g., Ed25519VerificationKey2020 or EcdsaSecp256k1VerificationKey2019
  controller: string; // DID of the controller
  publicKeyMultibase?: string; // Base64 URL encoded public key
  publicKeyJwk?: JsonWebKey; // JWK format public key
  blockchainAccountId?: string; // For on-chain keys, e.g., an account ID or address
  expires?: string; // ISO 8601 datetime string, e.g., 2025-12-31T23:59:59Z
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

// As per NIP-1 Signature Structure Specification
export interface SignedData {
  operation: string;
  params: Record<string, any>;
  nonce: string;
  timestamp: number; // Unix timestamp
}

export interface NIP1Signature {
  signer_did: string;
  key_id: string; // The id of the verificationMethod used for signing
  value: string; // The signature value, typically hex or base64 encoded
}

export interface NIP1SignedObject {
  signed_data: SignedData;
  signature: NIP1Signature;
}

/**
 * Represents the information needed to create a new operational key.
 */
export interface OperationalKeyInfo {
  idFragment?: string; // Optional fragment for the key id (e.g., 'key-2'). If not provided, one might be generated.
  type: string; // Cryptographic suite of the key, e.g., Ed25519VerificationKey2020
  publicKeyMaterial: Uint8Array | JsonWebKey; // The public key material
  controller?: string; // Defaults to the master DID if not provided
  expires?: string; // Optional expiration timestamp
}

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
 * Options for creating a master DID.
 */
export interface CreateMasterIdentityOptions {
  method?: string; // e.g., 'key', 'web', or a future chain-specific method like 'rooch'
  // Additional options specific to the DID method can be added here
  keyCurve?: string; // Specifies the curve to use for key generation (e.g., 'secp256k1', 'ed25519')
  masterKeyIdFragment?: string; // Custom fragment for the master key ID
  initialOperationalKey?: {
    publicKeyMaterial: Uint8Array | JsonWebKey;
    type: string; // e.g., Ed25519VerificationKey2020
    relationships?: VerificationRelationship[];
  };
}

export type VerificationRelationship = 
  | 'authentication' 
  | 'assertionMethod' 
  | 'keyAgreement' 
  | 'capabilityInvocation' 
  | 'capabilityDelegation';

/**
 * Result of creating a master identity.
 */
export interface MasterIdentity {
  did: string;
  masterKeyId: string; // ID of the primary master key in verificationMethod
  masterPublicKeyMultibase: string; // Multibase encoded public key
  masterPrivateKey: CryptoKey | Uint8Array; // The private key material for the master key
}

/**
 * DID creation request information
 */
export interface DIDCreationRequest {
  // Basic information
  publicKeyMultibase: string;
  keyType?: string; // Default inferred, e.g., 'EcdsaSecp256k1VerificationKey2019'
  
  // Optional preferred DID (some VDRs may support this)
  preferredDID?: string;
  
  // Controller information
  controller?: string | string[];
  
  // Initial verification relationships
  initialRelationships?: VerificationRelationship[];
  
  // Initial service endpoints
  initialServices?: ServiceEndpoint[];
  
  // Additional verification methods
  additionalVerificationMethods?: VerificationMethod[];
}

/**
 * DID creation result
 */
export interface DIDCreationResult {
  success: boolean;
  did: string; // Actual created DID (required field)
  didDocument?: DIDDocument; // The created DID Document
  transactionHash?: string;
  blockHeight?: number;
  error?: string;
  
  // Additional information for debugging
  debug?: {
    requestedDID?: string;
    actualDID?: string;
    events?: any[];
    transactionResult?: any; // Transaction execution result for debugging
  };
}

/**
 * CADOP creation request
 */
export interface CADOPCreationRequest {
  userDidKey: string;
  custodianServicePublicKey: string;
  custodianServiceVMType: string;
  additionalClaims?: Record<string, any>;
}

/**
 * Interface for Verifiable Data Registry (VDR) implementations
 * A VDR is responsible for storing and retrieving DID Documents
 */
export interface VDRInterface {
  /**
   * Resolve a DID to its DID Document
   * @param did The DID to resolve
   * @returns Promise resolving to the DID Document or null if not found
   */
  resolve(did: string): Promise<DIDDocument | null>;
  
  /**
   * Check if a DID exists in the registry
   * @param did The DID to check
   * @returns Promise resolving to true if the DID exists
   */
  exists(did: string): Promise<boolean>;
  
  /**
   * Get the DID method supported by this VDR
   * @returns The DID method (e.g., 'key', 'web', 'rooch')
   */
  getMethod(): string;
  
  /**
   * Create a new DID
   * 
   * @param request DID creation request
   * @param options Creation options
   * @returns DID creation result, containing the actual created DID
   */
  create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult>;
  
  /**
   * Create a DID via CADOP
   * 
   * @param request CADOP creation request
   * @param options Creation options
   * @returns DID creation result
   */
  createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult>;
  
  /**
   * Add a new verification method to a DID document
   * 
   * @param did The DID to update
   * @param verificationMethod The verification method to add
   * @param relationships Optional relationships to add the verification method to
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: any
  ): Promise<boolean>;
  
  /**
   * Remove a verification method from a DID document
   * 
   * @param did The DID to update
   * @param id The ID of the verification method to remove
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  removeVerificationMethod(
    did: string,
    id: string,
    options?: any
  ): Promise<boolean>;
  
  /**
   * Add a service to a DID document
   * 
   * @param did The DID to update
   * @param service The service to add
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  addService(
    did: string,
    service: ServiceEndpoint,
    options?: any
  ): Promise<boolean>;
  
  /**
   * Remove a service from a DID document
   * 
   * @param did The DID to update
   * @param id The ID of the service to remove
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  removeService(
    did: string,
    id: string,
    options?: any
  ): Promise<boolean>;
  
  /**
   * Update the verification relationships for a verification method
   * 
   * @param did The DID to update
   * @param id The ID of the verification method
   * @param add Relationships to add
   * @param remove Relationships to remove
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  updateRelationships(
    did: string,
    id: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: any
  ): Promise<boolean>;
  
  /**
   * Update the controller of a DID document
   * 
   * @param did The DID to update
   * @param controller The new controller value
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  updateController(
    did: string,
    controller: string | string[],
    options?: any
  ): Promise<boolean>;
}

/**
 * Interface for external signers that can be used for master key operations
 * This allows the SDK to request signatures from external systems (wallets, HSMs, etc.)
 * without directly managing the private keys
 */
export interface SignerInterface {
  /**
   * Signs data with a specified key
   * @param data The data to sign 
   * @param keyId The ID of the key to use for signing
   * @returns A promise that resolves to the signature
   */
  sign(data: Uint8Array, keyId: string): Promise<string>;
  
  /**
   * Checks if the signer can sign with a specific key
   * @param keyId The ID of the key to check
   * @returns A promise that resolves to true if the signer can sign with the key
   */
  canSign(keyId: string): Promise<boolean>;
}

/**
 * CADOP (NIP-3) related types for Custodian-Assisted DID Onboarding Protocol
 */

/**
 * Authentication methods enumeration for CADOP services
 */
export enum AuthMethod {
  GoogleOAuth = 1,
  TwitterOAuth = 2,
  AppleSignIn = 3,
  GitHubOAuth = 4,
  EmailOTP = 5,
  SMSOTP = 6,
  WeChatQR = 7,
  DiscordOAuth = 8,
  // 10+ reserved for future versions
}

/**
 * Sybil resistance levels for CADOP
 */
export enum SybilLevel {
  None = 0,           // No specific verification
  EmailBasic = 1,     // Email or basic Web2 OAuth
  PhoneNumber = 2,    // Phone number verification
  GovernmentID = 3    // Government ID or strong biometric
}

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
  jwks_uri: string;  // REQUIRED
  issuer_did?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
}

/**
 * Metadata for Web2ProofServiceCADOP
 */
export interface Web2ProofServiceMetadata {
  name?: string;
  accepts?: string[];  // Types of Web2 proofs accepted
  supportedClaims?: string[];  // Types of claims/VCs this service can issue
}

/**
 * CADOP service types
 */
export const CADOP_SERVICE_TYPES = {
  CUSTODIAN: 'CadopCustodianService',
  IDENTITY_PROVIDER: 'CadopIdPService', 
  WEB2_PROOF: 'Web2ProofServiceCADOP'
} as const;

/**
 * OIDC ID Token claims required for CADOP
 */
export interface CadopIdTokenClaims {
  iss: string;        // Issuer identifier
  sub: string;        // Subject (user's DID, typically did:key)
  aud: string;        // Audience (custodian DID)
  exp: number;        // Expiration time
  iat: number;        // Issued at time
  jti: string;        // JWT ID (unique identifier)
  nonce: string;      // Nonce from state parameter
  pub_jwk: JsonWebKey; // Public key in JWK format
  sybil_level: SybilLevel; // Sybil resistance level
}

/**
 * CADOP onboarding request payload
 */
export interface CadopOnboardingRequest {
  userDID: string;           // User's client-generated DID (e.g., did:key)
  initialAgentKey_pub: JsonWebKey | Uint8Array; // Public key material
  idToken: string;           // ID Token from CadopIdPService
  web2ProofAttestations?: string[]; // Optional additional VCs from Web2ProofService
}

/**
 * CADOP onboarding response
 */
export interface CadopOnboardingResponse {
  success: boolean;
  agentDID?: string;         // Final Agent DID (if newly created)
  transactionHash?: string;  // On-chain transaction hash (if applicable)
  error?: string;
}

/**
 * Key type constants for cryptographic operations
 */
export const KEY_TYPE = {
  ED25519: 'Ed25519VerificationKey2020',
  SECP256K1: 'EcdsaSecp256k1VerificationKey2019'
} as const;

export type KeyType = typeof KEY_TYPE[keyof typeof KEY_TYPE];

/**
 * Type guard to check if a string is a valid KeyType
 */
export function isKeyType(value: string): value is KeyType {
  return Object.values(KEY_TYPE).includes(value as KeyType);
}

/**
 * Convert a string to KeyType, with runtime validation
 * @throws Error if the string is not a valid KeyType
 */
export function toKeyType(value: string): KeyType {
  if (isKeyType(value)) {
    return value;
  }
  throw new Error(`Invalid key type: ${value}`);
}

/**
 * Type that represents either a KeyType or a string
 * Useful for functions that need to accept both strict KeyType and general string values
 */
export type KeyTypeInput = KeyType | string;
