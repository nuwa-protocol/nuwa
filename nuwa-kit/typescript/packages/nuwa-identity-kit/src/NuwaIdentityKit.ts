import { 
  DIDDocument, 
  MasterIdentity, 
  OperationalKeyInfo, 
  VerificationRelationship, 
  ServiceInfo, 
  NIP1SignedObject, 
  SignedData, 
  SignerInterface, 
  VDRInterface, 
  ServiceEndpoint,
  DIDCreationRequest
} from './types';
import { CryptoUtils } from './cryptoUtils';
import { VDRRegistry } from './VDRRegistry';

/**
 * Main SDK class for implementing NIP-1 Agent Single DID Multi-Key Model
 */
export class NuwaIdentityKit {
  private didDocument: DIDDocument;
  private operationalPrivateKeys: Map<string, CryptoKey | Uint8Array> = new Map();
  private vdr: VDRInterface;
  private signer: SignerInterface;

  // Private constructor, force use of factory methods
  private constructor(
    didDocument: DIDDocument,
    vdr: VDRInterface,
    signer: SignerInterface,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
    }
  ) {
    this.didDocument = didDocument;
    this.vdr = vdr;
    this.signer = signer;
    
    if (options?.operationalPrivateKeys) {
      this.operationalPrivateKeys = options.operationalPrivateKeys;
    }
  }

  // Factory methods
  /**
   * Create an instance from an existing DID (for managing existing DIDs)
   */
  static async fromExistingDID(
    did: string,
    signer: SignerInterface,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
    }
  ): Promise<NuwaIdentityKit> {
    const registry = VDRRegistry.getInstance();
    const method = did.split(':')[1];
    const vdr = registry.getVDR(method);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${method}'`);
    }

    // Resolve DID to get DID Document
    const didDocument = await registry.resolveDID(did);
    if (!didDocument) {
      throw new Error(`Failed to resolve DID ${did}`);
    }

    return new NuwaIdentityKit(didDocument, vdr, signer, options);
  }

  /**
   * Create an instance from a DID Document (for scenarios with known DID Document)
   */
  static fromDIDDocument(
    didDocument: DIDDocument,
    signer: SignerInterface,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
    }
  ): NuwaIdentityKit {
    const method = didDocument.id.split(':')[1];
    const vdr = VDRRegistry.getInstance().getVDR(method);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${method}'`);
    }

    return new NuwaIdentityKit(didDocument, vdr, signer, options);
  }

  /**
   * Create and publish a new DID
   */
  static async createNewDID(
    method: string,
    creationRequest: DIDCreationRequest,
    signer: SignerInterface,
    options?: Record<string, any>
  ): Promise<NuwaIdentityKit> {
    const registry = VDRRegistry.getInstance();
    const vdr = registry.getVDR(method);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${method}'`);
    }

    const result = await registry.createDID(method, creationRequest, options);
    if (!result.success || !result.didDocument) {
      throw new Error(`Failed to create DID: ${result.error || 'Unknown error'}`);
    }

    return new NuwaIdentityKit(result.didDocument, vdr, signer, options);
  }

  // Verification Method Management
  /**
   * Find a key that has the specified verification relationship and is available for signing
   * @param relationship The required verification relationship
   * @returns The key ID if found, undefined otherwise
   */
  private async findKeyWithRelationship(
    relationship: VerificationRelationship
  ): Promise<string | undefined> {
    // Get all available keys from the signer
    const availableKeyIds = await this.signer.listKeyIds();
    if (!availableKeyIds.length) {
      return undefined;
    }

    // Get keys with the specified relationship from DID Document
    const relationships = this.didDocument[relationship] as (string | { id: string })[];
    if (!relationships?.length) {
      return undefined;
    }

    // Find the first key that exists in both the DID Document and signer
    for (const item of relationships) {
      const keyId = typeof item === 'string' ? item : item.id;
      if (availableKeyIds.includes(keyId)) {
        return keyId;
      }
    }

    return undefined;
  }

  /**
   * Find all keys that have the specified verification relationship and are available for signing
   * @param relationship The required verification relationship
   * @returns Array of key IDs that match the criteria
   */
  private async findKeysWithRelationship(
    relationship: VerificationRelationship
  ): Promise<string[]> {
    const availableKeyIds = await this.signer.listKeyIds();
    if (!availableKeyIds.length) {
      return [];
    }

    const relationships = this.didDocument[relationship] as (string | { id: string })[];
    if (!relationships?.length) {
      return [];
    }

    return relationships
      .map(item => typeof item === 'string' ? item : item.id)
      .filter(keyId => availableKeyIds.includes(keyId));
  }

  async addVerificationMethod(
    keyInfo: OperationalKeyInfo,
    relationships: VerificationRelationship[],
    options?: {
      keyId?: string;
    }
  ): Promise<string> {
    // 1. Get signing key
    const signingKeyId = options?.keyId || await this.findKeyWithRelationship('capabilityDelegation');
    if (!signingKeyId) {
      throw new Error('No key with capabilityDelegation permission available');
    }

    // 2. Create verification method entry
    const keyIdFragment = keyInfo.idFragment || `key-${Date.now()}`;
    const keyId = `${this.didDocument.id}#${keyIdFragment}`;
    const verificationMethodEntry = {
      id: keyId,
      type: keyInfo.type,
      controller: keyInfo.controller || this.didDocument.id,
      publicKeyMultibase: keyInfo.publicKeyMaterial instanceof Uint8Array 
        ? await CryptoUtils.publicKeyToMultibase(keyInfo.publicKeyMaterial, keyInfo.type)
        : undefined,
      publicKeyJwk: !(keyInfo.publicKeyMaterial instanceof Uint8Array)
        ? keyInfo.publicKeyMaterial
        : undefined
    };

    // 3. Call VDR interface
    const published = await this.vdr.addVerificationMethod(
      this.didDocument.id,
      verificationMethodEntry,
      relationships,
      {
        signer: this.signer,
        keyId: signingKeyId
      }
    );

    if (!published) {
      throw new Error(`Failed to publish verification method ${keyId}`);
    }

    // 4. Update local state
    await this.updateLocalDIDDocument();
    
    return keyId;
  }

  async removeVerificationMethod(
    keyId: string,
    options?: {
      keyId?: string;
    }
  ): Promise<boolean> {
    const signingKeyId = options?.keyId || await this.findKeyWithRelationship('capabilityDelegation');
    if (!signingKeyId) {
      throw new Error('No key with capabilityDelegation permission available');
    }

    const published = await this.vdr.removeVerificationMethod(
      this.didDocument.id,
      keyId,
      {
        signer: this.signer
      }
    );

    if (published) {
      // Update local state
      if (this.didDocument.verificationMethod) {
        this.didDocument.verificationMethod = this.didDocument.verificationMethod.filter(vm => vm.id !== keyId);
      }

      const relationships: VerificationRelationship[] = [
        'authentication',
        'assertionMethod',
        'keyAgreement',
        'capabilityInvocation',
        'capabilityDelegation'
      ];

      relationships.forEach(rel => {
        if (this.didDocument[rel]) {
          this.didDocument[rel] = (this.didDocument[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== keyId;
            if (typeof item === 'object' && item.id) return item.id !== keyId;
            return true;
          });
        }
      });

      this.operationalPrivateKeys.delete(keyId);
      return true;
    }

    return false;
  }

  async updateVerificationMethodRelationships(
    keyId: string,
    addRelationships: VerificationRelationship[],
    removeRelationships: VerificationRelationship[],
    options: {
      signer?: SignerInterface;
    }
  ): Promise<boolean> {
    const published = await this.vdr.updateRelationships(
      this.didDocument.id,
      keyId,
      addRelationships,
      removeRelationships,
      {
        signer: options.signer
      }
    );

    if (published) {
      // Update local state
      addRelationships.forEach(rel => {
        if (!this.didDocument[rel]) {
          this.didDocument[rel] = [];
        }
        const relationshipArray = this.didDocument[rel] as (string | object)[];
        if (!relationshipArray.some(item => {
          return typeof item === 'string' ? item === keyId : (item as any).id === keyId;
        })) {
          relationshipArray.push(keyId);
        }
      });

      removeRelationships.forEach(rel => {
        if (this.didDocument[rel]) {
          this.didDocument[rel] = (this.didDocument[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== keyId;
            if (typeof item === 'object' && item.id) return item.id !== keyId;
            return true;
          });
        }
      });

      return true;
    }

    return false;
  }

  // Service Management
  async addService(
    serviceInfo: ServiceInfo,
    options?: {
      keyId?: string;
    }
  ): Promise<string> {
    const signingKeyId = options?.keyId || await this.findKeyWithRelationship('capabilityInvocation');
    if (!signingKeyId) {
      throw new Error('No key with capabilityInvocation permission available');
    }

    const serviceId = `${this.didDocument.id}#${serviceInfo.idFragment}`;
    const serviceEntry = {
      id: serviceId,
      type: serviceInfo.type,
      serviceEndpoint: serviceInfo.serviceEndpoint,
      ...(serviceInfo.additionalProperties || {}),
    };

    const published = await this.vdr.addService(
      this.didDocument.id,
      serviceEntry,
      {
        signer: this.signer,
        keyId: signingKeyId
      }
    );

    if (!published) {
      throw new Error(`Failed to publish service ${serviceId}`);
    }
    // Update local state
    this.didDocument = await this.vdr.resolve(this.didDocument.id) as DIDDocument;
    console.log('After addService', JSON.stringify(this.didDocument, null, 2))
    return serviceId;
  }

  async removeService(
    serviceId: string,
    options?: {
      keyId?: string;
    }
  ): Promise<boolean> {
    const signingKeyId = options?.keyId || await this.findKeyWithRelationship('capabilityInvocation');
    if (!signingKeyId) {
      throw new Error('No key with capabilityInvocation permission available');
    }

    const published = await this.vdr.removeService(
      this.didDocument.id,
      serviceId,
      {
        signer: this.signer,
        keyId: signingKeyId
      }
    );

    if (published) {
      // Update local state
      if (this.didDocument.service) {
        this.didDocument.service = this.didDocument.service.filter(s => s.id !== serviceId);
      }
      return true;
    }

    return false;
  }

  // Signing and Verification
  async createNIP1Signature(
    payload: Omit<SignedData, 'nonce' | 'timestamp'>,
    keyId: string
  ): Promise<NIP1SignedObject> {
    const verificationMethod = this.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Verification method for keyId ${keyId} not found in DID document.`);
    }

    const keyType = verificationMethod.type;
    const signedData: SignedData = {
      ...payload,
      nonce: crypto.getRandomValues(new Uint32Array(1))[0].toString(),
      timestamp: Math.floor(Date.now() / 1000),
    };

    const canonicalData = JSON.stringify(signedData, Object.keys(signedData).sort());
    const dataToSign = new TextEncoder().encode(canonicalData);

    const privateKey = this.operationalPrivateKeys.get(keyId);
    if (!privateKey) {
      throw new Error(`Private key for keyId ${keyId} not found and no suitable external signer is available.`);
    }
    const signatureValue = await CryptoUtils.sign(dataToSign, privateKey, keyType);

    return {
      signed_data: signedData,
      signature: {
        signer_did: this.didDocument.id,
        key_id: keyId,
        value: signatureValue,
      },
    };
  }

  static async verifyNIP1Signature(
    signedObject: NIP1SignedObject,
    resolvedDidDocumentOrVDRs: DIDDocument | VDRInterface[]
  ): Promise<boolean> {
    const { signed_data, signature } = signedObject;
    let resolvedDidDocument: DIDDocument;

    if (Array.isArray(resolvedDidDocumentOrVDRs)) {
      const did = signature.signer_did;
      const didMethod = did.split(':')[1];
      const vdr = resolvedDidDocumentOrVDRs.find(v => v.getMethod() === didMethod);
      
      if (!vdr) {
        console.error(`No VDR available for DID method '${didMethod}'`);
        return false;
      }
      
      resolvedDidDocument = await vdr.resolve(did) as DIDDocument;
      if (!resolvedDidDocument) {
        console.error(`Failed to resolve DID ${did}`);
        return false;
      }
    } else {
      resolvedDidDocument = resolvedDidDocumentOrVDRs;
    }

    // Verify timestamp
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signed_data.timestamp) > 300) {
      console.warn('Timestamp out of valid window');
      return false;
    }

    // Verify signer DID
    if (resolvedDidDocument.id !== signature.signer_did) {
      console.error('Signer DID does not match resolved DID document ID');
      return false;
    }

    // Find verification method
    const verificationMethod = resolvedDidDocument.verificationMethod?.find(
      vm => vm.id === signature.key_id
    );
    if (!verificationMethod) {
      console.error(`Verification method ${signature.key_id} not found in DID document.`);
      return false;
    }

    // Extract public key
    let publicKeyMaterial: JsonWebKey | Uint8Array | null = null;
    if (verificationMethod.publicKeyJwk) {
      publicKeyMaterial = verificationMethod.publicKeyJwk;
    } else if (verificationMethod.publicKeyMultibase) {
      publicKeyMaterial = new TextEncoder().encode(verificationMethod.publicKeyMultibase.substring(1));
    }

    if (!publicKeyMaterial) {
      console.error('Public key material not found in verification method.');
      return false;
    }

    // Verify signature
    const canonicalData = JSON.stringify(signed_data, Object.keys(signed_data).sort());
    const dataToVerify = new TextEncoder().encode(canonicalData);
    
    return await CryptoUtils.verify(
      dataToVerify,
      signature.value,
      publicKeyMaterial,
      verificationMethod.type
    );
  }

  // DID Resolution
  async resolveDID(did: string): Promise<DIDDocument | null> {
    const didMethod = did.split(':')[1];
    const vdr = VDRRegistry.getInstance().getVDR(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    try {
      return await vdr.resolve(did);
    } catch (error) {
      console.error(`Failed to resolve DID ${did}:`, error);
      throw new Error(`Failed to resolve DID: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async didExists(did: string): Promise<boolean> {
    const didMethod = did.split(':')[1];
    const vdr = VDRRegistry.getInstance().getVDR(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    try {
      return await vdr.exists(did);
    } catch (error) {
      console.error(`Failed to check if DID ${did} exists:`, error);
      throw new Error(`Failed to check if DID exists: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Document Access
  getDIDDocument(): DIDDocument {
    return JSON.parse(JSON.stringify(this.didDocument));
  }

  // Service Discovery
  findServiceByType(serviceType: string): ServiceEndpoint | undefined {
    return this.didDocument.service?.find(s => s.type === serviceType);
  }

  // State Checks
  async canSignWithKey(keyId: string): Promise<boolean> {
    if (this.operationalPrivateKeys.has(keyId)) {
      return true;
    }
    
    return false;
  }

  // Private Key Management Methods
  private storeOperationalPrivateKey(keyId: string, privateKey: CryptoKey | Uint8Array): void {
    this.operationalPrivateKeys.set(keyId, privateKey);
  }

  private getOperationalPrivateKey(keyId: string): CryptoKey | Uint8Array | undefined {
    return this.operationalPrivateKeys.get(keyId);
  }

  /**
   * Get all available keys grouped by their verification relationships
   * @returns Object mapping verification relationships to arrays of key IDs
   */
  async getAvailableKeyIds(): Promise<{[key in VerificationRelationship]?: string[]}> {
    const relationships: VerificationRelationship[] = [
      'authentication',
      'assertionMethod',
      'keyAgreement',
      'capabilityInvocation',
      'capabilityDelegation'
    ];

    const result: {[key in VerificationRelationship]?: string[]} = {};
    
    for (const relationship of relationships) {
      const keys = await this.findKeysWithRelationship(relationship);
      if (keys.length > 0) {
        result[relationship] = keys;
      }
    }

    return result;
  }

  private async updateLocalDIDDocument(): Promise<void> {
    this.didDocument = await this.vdr.resolve(this.didDocument.id) as DIDDocument;
    console.log('After updateLocalDIDDocument', JSON.stringify(this.didDocument, null, 2))
  }

  getSigner(): SignerInterface {
    return this.signer;
  }
} 