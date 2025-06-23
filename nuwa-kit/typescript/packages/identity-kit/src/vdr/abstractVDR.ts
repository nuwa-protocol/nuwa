import {
  DIDDocument,
  VerificationMethod,
  VerificationRelationship,
  ServiceEndpoint,
} from '../types/did';
import {
  DIDCreationRequest,
  DIDCreationResult,
  CADOPCreationRequest,
  VDRInterface,
} from './types';
import { parseDid } from '../utils/did';

/**
 * Abstract base class for implementing Verifiable Data Registry functionality
 * Provides common utility methods and enforces the VDRInterface contract
 */
export abstract class AbstractVDR implements VDRInterface {
  // The DID method this VDR handles (e.g., 'key', 'web')
  protected readonly method: string;

  /**
   * Creates a new AbstractVDR instance
   *
   * @param method The DID method this VDR handles
   */
  constructor(method: string) {
    this.method = method;
  }

  /**
   * Gets the DID method this VDR handles
   *
   * @returns The DID method string
   */
  getMethod(): string {
    return this.method;
  }

  /**
   * Validates that a given DID matches the method this VDR handles
   *
   * @param did The DID to validate
   * @throws Error if the DID doesn't match this VDR's method
   */
  protected validateDIDMethod(did: string): void {
    const { method } = parseDid(did);
    if (method !== this.method) {
      throw new Error(`DID ${did} is not a valid did:${this.method} identifier`);
    }
  }

  /**
   * Validates a DID document's basic structure
   *
   * @param document The DID document to validate
   * @returns true if valid, throws an error otherwise
   */
  protected validateDocument(document: DIDDocument): boolean {
    if (!document.id) {
      throw new Error('DID document must have an id');
    }

    this.validateDIDMethod(document.id);

    if (!document['@context']) {
      throw new Error('DID document must have a @context property');
    }

    if (!document.verificationMethod || document.verificationMethod.length === 0) {
      throw new Error('DID document must have at least one verification method');
    }

    return true;
  }

  /**
   * Check if a key has a specific verification relationship in a DID document
   *
   * @param didDocument The DID document to check
   * @param keyId The ID of the verification method
   * @param relationship The verification relationship to check
   * @returns True if the key has the relationship
   */
  protected hasVerificationRelationship(
    didDocument: DIDDocument,
    keyId: string,
    relationship: VerificationRelationship
  ): boolean {
    const relationshipArray = didDocument[relationship];
    if (!relationshipArray) return false;

    return relationshipArray.some(item => {
      if (typeof item === 'string') {
        return item === keyId;
      } else if (typeof item === 'object' && item.id) {
        return item.id === keyId;
      }
      return false;
    });
  }

  /**
   * Validates if a key has permission to perform an operation
   *
   * @param didDocument The DID document
   * @param keyId The ID of the key
   * @param requiredRelationship The required verification relationship
   * @returns True if the key has permission
   */
  protected validateKeyPermission(
    didDocument: DIDDocument,
    keyId: string,
    requiredRelationship: VerificationRelationship
  ): boolean {
    const keyExists = didDocument.verificationMethod?.some(vm => vm.id === keyId);
    if (!keyExists) {
      console.error(`Key ${keyId} not found in DID document`);
      return false;
    }

    const isPrimaryKey = didDocument.verificationMethod?.[0]?.id === keyId;
    if (isPrimaryKey) {
      return true;
    }

    const hasPermission = didDocument[requiredRelationship]?.includes(keyId);

    if (!hasPermission) {
      console.error(`Key ${keyId} does not have ${requiredRelationship} permission`);
      return false;
    }

    return true;
  }

  /**
   * Default create implementation - throws not implemented error for base class
   * Subclasses must override this method to provide actual implementation
   */
  async create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult> {
    throw new Error(`create method not implemented for ${this.method} VDR`);
  }

  /**
   * Default CADOP implementation - throws not implemented error
   */
  async createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult> {
    throw new Error(`createViaCADOP not implemented for ${this.method} VDR`);
  }

  /**
   * Build DID Document from creation request
   */
  protected buildDIDDocumentFromRequest(request: DIDCreationRequest): DIDDocument {
    const did = request.preferredDID!;

    // Extract the first controller for the verification method (which only accepts string)
    const controllerForVM = Array.isArray(request.controller)
      ? request.controller[0]
      : request.controller || did;

    const verificationMethod: VerificationMethod = {
      id: `${did}#account-key`,
      type: request.keyType || 'EcdsaSecp256k1VerificationKey2019',
      controller: controllerForVM,
      publicKeyMultibase: request.publicKeyMultibase,
    };

    const didDocument: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      controller: request.controller
        ? Array.isArray(request.controller)
          ? request.controller
          : [request.controller]
        : [did],
      verificationMethod: [verificationMethod, ...(request.additionalVerificationMethods || [])],
      service: request.initialServices || [],
    };

    // Set initial relationships
    const relationships = request.initialRelationships || [
      'authentication',
      'assertionMethod',
      'capabilityInvocation',
      'capabilityDelegation',
    ];

    const vmId = verificationMethod.id;
    relationships.forEach(rel => {
      if (!didDocument[rel]) {
        didDocument[rel] = [];
      }
      (didDocument[rel] as string[]).push(vmId);
    });

    return didDocument;
  }

  /**
   * Resolves a DID to its corresponding DID document
   * Implementations must provide this functionality
   */
  abstract resolve(did: string): Promise<DIDDocument | null>;

  /**
   * Checks if a DID exists in the registry
   * Default implementation tries to resolve and checks if result is not null
   */
  async exists(did: string): Promise<boolean> {
    try {
      const doc = await this.resolve(did);
      return doc !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add a verification method to a DID document
   * Default implementation that should be overridden by specific VDR implementations
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    throw new Error(`addVerificationMethod not implemented for ${this.method} VDR`);
  }

  /**
   * Remove a verification method from a DID document
   * Default implementation that should be overridden by specific VDR implementations
   */
  async removeVerificationMethod(did: string, id: string, options?: any): Promise<boolean> {
    throw new Error(`removeVerificationMethod not implemented for ${this.method} VDR`);
  }

  /**
   * Add a service to a DID document
   * Default implementation that should be overridden by specific VDR implementations
   */
  async addService(did: string, service: ServiceEndpoint, options?: any): Promise<boolean> {
    throw new Error(`addService not implemented for ${this.method} VDR`);
  }

  /**
   * Remove a service from a DID document
   * Default implementation that should be overridden by specific VDR implementations
   */
  async removeService(did: string, id: string, options?: any): Promise<boolean> {
    throw new Error(`removeService not implemented for ${this.method} VDR`);
  }

  /**
   * Update verification relationships for a verification method
   * Default implementation that should be overridden by specific VDR implementations
   */
  async updateRelationships(
    did: string,
    id: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    throw new Error(`updateRelationships not implemented for ${this.method} VDR`);
  }

  /**
   * Update the controller of a DID document
   * Default implementation that should be overridden by specific VDR implementations
   */
  async updateController(
    did: string,
    controller: string | string[],
    options?: any
  ): Promise<boolean> {
    throw new Error(`updateController not implemented for ${this.method} VDR`);
  }

  /**
   * Validates options for update operations and ensures proper permissions
   *
   * @param did The DID being operated on
   * @param document The resolved DID document
   * @param keyId The key ID used for signing
   * @param requiredRelationship The required verification relationship for this operation
   * @throws Error if validation fails
   */
  protected async validateUpdateOperation(
    did: string,
    document: DIDDocument | null,
    keyId: string,
    requiredRelationship: VerificationRelationship
  ): Promise<DIDDocument> {
    // Validate DID method
    this.validateDIDMethod(did);

    // Check if document exists
    if (!document) {
      throw new Error(`DID document ${did} not found`);
    }

    // Check permission
    if (!this.validateKeyPermission(document, keyId, requiredRelationship)) {
      throw new Error(
        `Key ${keyId} does not have ${requiredRelationship} permission required for this operation`
      );
    }

    return document;
  }

  /**
   * Validates that inputs to addVerificationMethod are correct
   *
   * @param did The DID being operated on
   * @param verificationMethod The verification method to validate
   * @param document The current DID document
   * @throws Error if validation fails
   */
  protected validateVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    document: DIDDocument
  ): void {
    // Ensure ID starts with the DID
    if (!verificationMethod.id.startsWith(did)) {
      throw new Error(`Verification method ID ${verificationMethod.id} must start with DID ${did}`);
    }

    // Check if method already exists
    if (document.verificationMethod?.some(vm => vm.id === verificationMethod.id)) {
      throw new Error(`Verification method ${verificationMethod.id} already exists`);
    }

    // Validate required fields
    if (!verificationMethod.type) {
      throw new Error('Verification method must have a type');
    }

    if (!verificationMethod.controller) {
      throw new Error('Verification method must have a controller');
    }

    // Check that at least one key material format is present
    if (!verificationMethod.publicKeyMultibase && !verificationMethod.publicKeyJwk) {
      throw new Error('Verification method must have at least one form of public key material');
    }
  }

  /**
   * Validates that inputs to addService are correct
   *
   * @param did The DID being operated on
   * @param service The service to validate
   * @param document The current DID document
   * @throws Error if validation fails
   */
  protected validateService(did: string, service: ServiceEndpoint, document: DIDDocument): void {
    // Ensure ID starts with the DID
    if (!service.id.startsWith(did)) {
      throw new Error(`Service ID ${service.id} must start with DID ${did}`);
    }

    // Check if service already exists
    if (document.service?.some(s => s.id === service.id)) {
      throw new Error(`Service ${service.id} already exists`);
    }

    // Validate required fields
    if (!service.type) {
      throw new Error('Service must have a type');
    }

    if (!service.serviceEndpoint) {
      throw new Error('Service must have a serviceEndpoint');
    }
  }

  /**
   * Makes a deep copy of a DID document for modification
   *
   * @param document The DID document to copy
   * @returns A deep copy of the document
   */
  protected copyDocument(document: DIDDocument): DIDDocument {
    return JSON.parse(JSON.stringify(document));
  }
}
