import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship, DIDCreationRequest, DIDCreationResult, CADOPCreationRequest } from '../types';
import { AbstractVDR } from './abstractVDR';
import { CryptoUtils } from '../cryptoUtils';

/**
 * KeyVDR handles did:key DIDs
 * 
 * did:key DIDs are self-resolving as they contain the public key material
 * embedded in the identifier. This implementation follows the did:key method
 * specification.
 * 
 * Example did:key: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 * 
 * Reference: https://w3c-ccg.github.io/did-method-key/
 */
export class KeyVDR extends AbstractVDR {
  // In-memory cache of documents, shared across all instances
  private static documentCache: Map<string, DIDDocument> = new Map();
  
  constructor() {
    super('key');
  }
  
  /**
   * Resets the document cache - primarily for testing purposes
   * to ensure tests don't interfere with each other.
   */
  public reset(): void {
    KeyVDR.documentCache.clear();
  }
  
  /**
   * Parses a did:key identifier to extract the public key
   * 
   * @param did The did:key identifier
   * @returns The extracted multibase-encoded public key
   */
  private extractMultibaseKey(did: string): string {
    this.validateDIDMethod(did);
    
    // Extract the multibase-encoded public key from the DID
    // did:key:<multibase-encoded-key>
    const parts = did.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid did:key format: ${did}`);
    }
    
    return parts[2];
  }
  
  /**
   * Generates a DID document for a did:key identifier
   * 
   * @param did The did:key identifier
   * @returns A generated DID document based on the encoded key
   */
  private async generateDIDDocument(did: string): Promise<DIDDocument> {
    const multibaseKey = this.extractMultibaseKey(did);
    
    // Determine key type based on multibase prefix
    // This is a simplified implementation - a full implementation would
    // support more key types and proper multibase decoding
    let keyType = 'Ed25519VerificationKey2020';
    if (multibaseKey.startsWith('zQ3')) {
      keyType = 'EcdsaSecp256k1VerificationKey2019';
    }
    
    // The verification method ID is usually the DID with a fragment
    // that references the key
    const verificationMethodId = `${did}#${multibaseKey}`;
    
    // Create a basic DID Document
    const didDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        keyType === 'Ed25519VerificationKey2020' 
          ? 'https://w3id.org/security/suites/ed25519-2020/v1'
          : 'https://w3id.org/security/suites/secp256k1-2019/v1'
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: keyType,
          controller: did,
          publicKeyMultibase: multibaseKey
        }
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      capabilityInvocation: [verificationMethodId],
      capabilityDelegation: [verificationMethodId]
    };
    
    return didDocument;
  }
  
  /**
   * Override resolve to handle test mode
   */
  async resolve(did: string): Promise<DIDDocument | null> {
    try {
      // Check the cache first
      if (KeyVDR.documentCache.has(did)) {
        return KeyVDR.documentCache.get(did)!;
      }
      
      return null;
    } catch (error) {
      console.error(`Error resolving ${did}:`, error);
      return null;
    }
  }
  
  /**
   * Add a verification method to a did:key document
   * For did:key, this is mostly a simulation as the document is derived from the key
   * This operation will update the local cache but not the actual structure of the did:key
   * 
   * @param did The DID to update
   * @param verificationMethod The verification method to add
   * @param relationships Optional relationships to add the verification method to
   * @param options Additional options like keyId for signing
   * @returns Promise resolving to true if successful in updating the cache
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships: VerificationRelationship[] = [],
    options?: any
  ): Promise<boolean> {
    try {
      const originalDocument = await this.resolve(did);
      if (!originalDocument) {
        throw new Error(`DID ${did} not found`);
      }

      // Use parent class validation methods
      await this.validateUpdateOperation(did, originalDocument, options?.keyId, 'capabilityDelegation');
      this.validateVerificationMethod(did, verificationMethod, originalDocument);

      // Check for duplicate verification method ID
      if (originalDocument.verificationMethod?.some(vm => vm.id === verificationMethod.id)) {
        throw new Error(`Verification method ${verificationMethod.id} already exists`);
      }

      if (!originalDocument.verificationMethod) {
        originalDocument.verificationMethod = [];
      }

      // Add the verification method
      originalDocument.verificationMethod.push(verificationMethod);

      // Add relationships without duplicates
      relationships.forEach(relationship => {
        if (!originalDocument[relationship]) {
          originalDocument[relationship] = [];
        }
        if (!originalDocument[relationship]!.includes(verificationMethod.id)) {
          originalDocument[relationship]!.push(verificationMethod.id);
        }
      });

      // Update the cache
      KeyVDR.documentCache.set(did, originalDocument);
      return true;
    } catch (error) {
      console.error(`Error adding verification method to ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a verification method from a did:key document
   * For did:key, this is mostly a simulation as the document is derived from the key
   * This operation will update the local cache but not the actual structure of the did:key
   * 
   * @param did The DID to update
   * @param keyId The ID of the verification method to remove
   * @param options Additional options
   * @returns Promise resolving to true if successful in updating the cache
   */
  async removeVerificationMethod(did: string, keyId: string, options?: any): Promise<boolean> {
    try {
      const originalDocument = await this.resolve(did);
      if (!originalDocument) {
        throw new Error(`DID ${did} not found`);
      }

      // Use parent class validation method
      await this.validateUpdateOperation(did, originalDocument, options?.keyId, 'capabilityDelegation');

      const verificationMethods = originalDocument.verificationMethod || [];
      const vmIndex = verificationMethods.findIndex(vm => vm.id === keyId);
      if (vmIndex === -1) {
        // Verification method not found, silently succeed
        return true; 
      }

      const isPrimaryKey = vmIndex === 0;
      if (isPrimaryKey) {
        throw new Error(`Cannot remove the primary key ${keyId} from did:key document`);
      }

      originalDocument.verificationMethod = verificationMethods.filter(vm => vm.id !== keyId);

      const relationships: VerificationRelationship[] = ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation'];
      relationships.forEach(relationship => {
        if (originalDocument[relationship]) {
          originalDocument[relationship] = originalDocument[relationship]!.filter(id => id !== keyId);
        }
      });

      KeyVDR.documentCache.set(did, originalDocument);
      return true;
    } catch (error) {
      console.error(`Error removing verification method from ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Add a service to a did:key document
   * For did:key, this is mostly a simulation as the document is derived from the key
   * This operation will update the local cache but not the actual structure of the did:key
   * 
   * @param did The DID to update
   * @param service The service to add
   * @param options Additional options
   * @returns Promise resolving to true if successful in updating the cache
   */
  async addService(did: string, service: ServiceEndpoint, options?: any): Promise<boolean> {
    try {
      const originalDocument = await this.resolve(did);
      if (!originalDocument) {
        throw new Error(`DID ${did} not found`);
      }

      // Use parent class validation methods
      await this.validateUpdateOperation(did, originalDocument, options?.keyId, 'capabilityInvocation');
      this.validateService(did, service, originalDocument);

      if (!originalDocument.service) {
        originalDocument.service = [];
      }
      originalDocument.service.push(service);

      KeyVDR.documentCache.set(did, originalDocument);
      return true;
    } catch (error) {
      console.error(`Error adding service to ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a service from a did:key document
   * For did:key, this is mostly a simulation as the document is derived from the key
   * This operation will update the local cache but not the actual structure of the did:key
   * 
   * @param did The DID to update
   * @param id The ID of the service to remove
   * @param options Additional options
   * @returns Promise resolving to true if successful in updating the cache
   */
  async removeService(did: string, serviceId: string, options?: any): Promise<boolean> {
    try {
      const originalDocument = await this.resolve(did);
      if (!originalDocument) {
        throw new Error(`DID ${did} not found`);
      }

      // Use parent class validation method
      await this.validateUpdateOperation(did, originalDocument, options?.keyId, 'capabilityInvocation');

      if (!originalDocument.service || !originalDocument.service.some(s => s.id === serviceId)) {
        // Service not found, silently succeed
        return true;
      }

      originalDocument.service = originalDocument.service.filter(s => s.id !== serviceId);

      KeyVDR.documentCache.set(did, originalDocument);
      return true;
    } catch (error) {
      console.error(`Error removing service from ${did}:`, error);
      throw error;
    }
  }

  /**
   * Override create method for did:key
   * For did:key, we can generate the DID from the public key
   */
  async create(request: DIDCreationRequest): Promise<DIDCreationResult> {
    try {
      // Validate the key format
      if (!request.publicKeyMultibase || !request.publicKeyMultibase.startsWith('z')) {
        return {
          success: false,
          error: 'Invalid key format: publicKeyMultibase must start with "z"'
        };
      }

      if (!request.preferredDID || !request.controller) {
        return {
          success: false,
          error: 'Missing required parameters: preferredDID and controller'
        };
      }

      // Use the parent class method to build the DID document
      const didDocument = this.buildDIDDocumentFromRequest(request);

      // Store the document
      KeyVDR.documentCache.set(request.preferredDID, didDocument);

      return {
        success: true,
        didDocument
      };
    } catch (error) {
      console.error(`Error creating DID document:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update verification relationships for a verification method
   */
  async updateRelationships(
    did: string,
    keyId: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    try {
      const originalDocument = await this.resolve(did);
      if (!originalDocument) {
        throw new Error(`DID ${did} not found`);
      }

      // Use parent class validation method
      await this.validateUpdateOperation(did, originalDocument, options?.keyId, 'capabilityDelegation');

      // Check if the verification method exists
      const verificationMethod = originalDocument.verificationMethod?.find(vm => vm.id === keyId);
      if (!verificationMethod) {
        throw new Error(`Verification method ${keyId} not found`);
      }

      // Remove relationships
      remove.forEach(relationship => {
        if (originalDocument[relationship]) {
          originalDocument[relationship] = originalDocument[relationship]!.filter(id => id !== keyId);
        }
      });

      // Add relationships without duplicates
      add.forEach(relationship => {
        if (!originalDocument[relationship]) {
          originalDocument[relationship] = [];
        }
        if (!originalDocument[relationship]!.includes(keyId)) {
          originalDocument[relationship]!.push(keyId);
        }
      });

      // Update the cache
      KeyVDR.documentCache.set(did, originalDocument);
      return true;
    } catch (error) {
      console.error(`Error updating relationships for ${did}:`, error);
      throw error;
    }
  }
}