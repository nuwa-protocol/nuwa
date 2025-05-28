import { DIDDocument, ServiceEndpoint, VerificationMethod, VerificationRelationship, DIDCreationRequest, DIDCreationResult, CADOPCreationRequest } from '../types';
import { AbstractVDR } from './abstractVDR';

export interface WebVDROptions {
  /**
   * Optional fetch function to use for HTTP requests
   * Defaults to global fetch if available
   */
  fetch?: typeof fetch;
  
  /**
   * Base path where DID documents are stored
   * Default: '/.well-known/did.json'
   */
  basePath?: string;
  
  /**
   * HTTP headers to include in requests
   */
  headers?: Record<string, string>;
  
  /**
   * Optional upload handler for publishing documents
   * Without this, store() will throw an error
   */
  uploadHandler?: (domain: string, path: string, document: DIDDocument) => Promise<boolean>;
}

/**
 * WebVDR handles did:web DIDs
 * 
 * did:web DIDs are typically in the format:
 * - did:web:<domain> -> resolves to https://<domain>/.well-known/did.json
 * - did:web:<domain>:<path> -> resolves to https://<domain>/<path>/did.json
 */
export class WebVDR extends AbstractVDR {
  private readonly options: WebVDROptions;
  private readonly fetchImpl: typeof fetch;
  
  constructor(options: WebVDROptions = {}) {
    super('web');
    
    this.options = {
      basePath: '/.well-known/did.json',
      headers: { Accept: 'application/json' },
      ...options
    };
    
    // Use provided fetch or global fetch
    this.fetchImpl = options.fetch || (typeof window !== 'undefined' ? window.fetch.bind(window) : global.fetch);
    
    if (!this.fetchImpl) {
      throw new Error('No fetch implementation available. Please provide one in the options.');
    }
  }
  
  /**
   * Parses a did:web identifier into domain and path components
   * 
   * @param did The did:web identifier
   * @returns An object with domain and path properties
   */
  private parseDIDWeb(did: string): { domain: string; path: string } {
    this.validateDIDMethod(did);
    
    // Remove 'did:web:' prefix
    const identifier = did.substring(8);
    
    // Split by colons - first part is domain, rest is path
    const parts = identifier.split(':');
    const domain = parts[0];
    
    let path = '';
    if (parts.length > 1) {
      // Join the remaining parts with '/' to form the path
      path = parts.slice(1).join('/');
    }
    
    return { domain, path };
  }
  
  /**
   * Constructs a URL from a did:web identifier
   * 
   * @param did The did:web identifier
   * @returns The URL where the DID document should be located
   */
  public getDocumentUrl(did: string): string {
    const { domain, path } = this.parseDIDWeb(did);
    
    if (path) {
      return `https://${domain}/${path}/did.json`;
    } else {
      return `https://${domain}${this.options.basePath}`;
    }
  }
  
  /**
   * Resolves a did:web identifier to a DID document
   * 
   * @param did The did:web identifier to resolve
   * @returns The resolved DID document or null if not found
   */
  async resolve(did: string): Promise<DIDDocument | null> {
    try {
      this.validateDIDMethod(did);
      
      const documentUrl = this.getDocumentUrl(did);
      
      // Fetch the document
      const response = await this.fetchImpl(documentUrl, {
        headers: this.options.headers
      });
      
      if (!response.ok) {
        console.error(`Failed to resolve ${did}: HTTP ${response.status}`);
        return null;
      }
      
      const document = await response.json();
      
      // Validate that the document ID matches the requested DID
      if (document.id !== did) {
        console.warn(`Document ID (${document.id}) doesn't match requested DID (${did})`);
      }
      
      return document;
    } catch (error) {
      console.error(`Error resolving ${did}:`, error);
      return null;
    }
  }
  
  /**
   * Adds a verification method to a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param verificationMethod The verification method to add
   * @param relationships Optional relationships to associate with the verification method
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod,
    relationships?: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if verification method already exists
      if (document.verificationMethod?.some(vm => vm.id === verificationMethod.id)) {
        throw new Error(`Verification method ${verificationMethod.id} already exists`);
      }
      
      // Add the verification method
      if (!document.verificationMethod) {
        document.verificationMethod = [];
      }
      document.verificationMethod.push(verificationMethod);
      
      // Add to relationships if specified
      if (relationships && relationships.length > 0) {
        relationships.forEach(rel => {
          if (!document[rel]) {
            document[rel] = [];
          }
          (document[rel] as string[]).push(verificationMethod.id);
        });
      }
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error adding verification method to ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Removes a verification method from a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param id The ID of the verification method to remove
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async removeVerificationMethod(
    did: string,
    id: string,
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Make sure the verification method exists
      if (!document.verificationMethod?.some(vm => vm.id === id)) {
        throw new Error(`Verification method ${id} not found`);
      }
      
      // Remove the verification method
      if (document.verificationMethod) {
        document.verificationMethod = document.verificationMethod.filter(vm => vm.id !== id);
      }
      
      // Remove from all relationships
      const relationships: VerificationRelationship[] = ['authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation'];
      relationships.forEach(rel => {
        if (document[rel]) {
          document[rel] = (document[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== id;
            if (typeof item === 'object' && item.id) return item.id !== id;
            return true;
          });
        }
      });
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error removing verification method from ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Adds a service to a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param service The service to add
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async addService(
    did: string,
    service: ServiceEndpoint,
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if service already exists
      if (document.service?.some(s => s.id === service.id)) {
        throw new Error(`Service ${service.id} already exists`);
      }
      
      // Add the service
      if (!document.service) {
        document.service = [];
      }
      document.service.push(service);
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error adding service to ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Removes a service from a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param id The ID of the service to remove
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async removeService(
    did: string,
    id: string,
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if service exists
      if (!document.service?.some(s => s.id === id)) {
        throw new Error(`Service ${id} not found`);
      }
      
      // Remove the service
      if (document.service) {
        document.service = document.service.filter(s => s.id !== id);
      }
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error removing service from ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Updates the verification relationships for a verification method in a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param id The ID of the verification method
   * @param add Relationships to add
   * @param remove Relationships to remove
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async updateRelationships(
    did: string,
    id: string,
    add: VerificationRelationship[],
    remove: VerificationRelationship[],
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Check if verification method exists
      if (!document.verificationMethod?.some(vm => vm.id === id)) {
        throw new Error(`Verification method ${id} not found`);
      }
      
      // Add relationships
      add.forEach(rel => {
        if (!document[rel]) {
          document[rel] = [];
        }
        
        const relationshipArray = document[rel] as (string | object)[];
        if (!relationshipArray.some(item => {
          return typeof item === 'string' ? item === id : (item as any).id === id;
        })) {
          relationshipArray.push(id);
        }
      });
      
      // Remove relationships
      remove.forEach(rel => {
        if (document[rel]) {
          document[rel] = (document[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== id;
            if (typeof item === 'object' && item.id) return item.id !== id;
            return true;
          });
        }
      });
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error updating relationships for ${did}:`, error);
      throw error;
    }
  }
  
  /**
   * Updates the controller of a DID Document for a did:web identifier
   * 
   * @param did The DID to update
   * @param controller The new controller value
   * @param options Optional operation options
   * @returns Promise resolving to true if successful
   */
  async updateController(
    did: string,
    controller: string | string[],
    options?: any
  ): Promise<boolean> {
    try {
      this.validateDIDMethod(did);
      
      // Get the current document
      const document = await this.resolve(did);
      if (!document) {
        throw new Error(`DID document ${did} not found`);
      }
      
      // Update controller
      document.controller = controller;
      
      // Store the updated document
      const { domain, path } = this.parseDIDWeb(did);
      
      if (!this.options.uploadHandler) {
        throw new Error('No uploadHandler configured for WebVDR');
      }
      
      return await this.options.uploadHandler(domain, path, document);
    } catch (error) {
      console.error(`Error updating controller for ${did}:`, error);
      throw error;
    }
  }

  /**
   * Override create method for did:web
   * For did:web, we require a preferred DID since it must match a domain
   */
  async create(request: DIDCreationRequest, options?: any): Promise<DIDCreationResult> {
    try {
      if (!request.preferredDID) {
        throw new Error('did:web requires preferredDID to specify the domain');
      }
      
      // Validate it's a proper did:web
      this.validateDIDMethod(request.preferredDID);
      
      // Build DID document using parent implementation
      const didDocument = this.buildDIDDocumentFromRequest(request);
      
      // We need an upload handler to store the document
      if (!this.options.uploadHandler) {
        throw new Error(
          'No uploadHandler configured for WebVDR. ' +
          'Please provide an uploadHandler in the options to enable document publishing.'
        );
      }
      
      // Parse DID to get domain and path
      const { domain, path } = this.parseDIDWeb(request.preferredDID);
      
      // Use the provided upload handler to store the document
      const success = await this.options.uploadHandler(domain, path, didDocument);
      
      if (!success) {
        throw new Error('Failed to publish DID document');
      }
      
      return {
        success: true,
        did: request.preferredDID,
        debug: {
          requestedDID: request.preferredDID,
          actualDID: request.preferredDID
        }
      };
    } catch (error) {
      return {
        success: false,
        did: request.preferredDID || `did:web:failed-${Date.now()}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * did:web doesn't typically support CADOP
   */
  async createViaCADOP(request: CADOPCreationRequest, options?: any): Promise<DIDCreationResult> {
    return {
      success: false,
      did: `did:web:cadop-not-supported`,
      error: 'CADOP is not typically supported for did:web method'
    };
  }
}
