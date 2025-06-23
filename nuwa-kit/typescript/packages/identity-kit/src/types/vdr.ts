// Verifiable Data Registry (VDR) related types

import { DIDDocument, VerificationRelationship, ServiceEndpoint } from './did';
import { SignerInterface } from './signer';

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
  additionalVerificationMethods?: any[];
}

/**
 * Result of DID creation operation
 */
export interface DIDCreationResult {
  success: boolean;
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
    verificationMethod: any,
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
  removeVerificationMethod(did: string, id: string, options?: any): Promise<boolean>;

  /**
   * Add a service to a DID document
   *
   * @param did The DID to update
   * @param service The service to add
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  addService(did: string, service: ServiceEndpoint, options?: any): Promise<boolean>;

  /**
   * Remove a service from a DID document
   *
   * @param did The DID to update
   * @param id The ID of the service to remove
   * @param options Additional options like signer and keyId
   * @returns Promise resolving to true if successful
   */
  removeService(did: string, id: string, options?: any): Promise<boolean>;

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
  updateController(did: string, controller: string | string[], options?: any): Promise<boolean>;
} 