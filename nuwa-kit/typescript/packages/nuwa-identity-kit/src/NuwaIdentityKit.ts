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

/**
 * Main SDK class for implementing NIP-1 Agent Single DID Multi-Key Model
 */
export class NuwaIdentityKit {
  private didDocument: DIDDocument;
  private operationalPrivateKeys: Map<string, CryptoKey | Uint8Array> = new Map();
  private externalSigner?: SignerInterface;
  private vdrRegistry: Map<string, VDRInterface> = new Map();

  // Private constructor, force use of factory methods
  private constructor(
    didDocument: DIDDocument,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface,
      vdrs?: VDRInterface[]
    }
  ) {
    this.didDocument = didDocument;
    
    if (options?.operationalPrivateKeys) {
      this.operationalPrivateKeys = options.operationalPrivateKeys;
    }
    this.externalSigner = options?.externalSigner;
    
    // Register VDRs if provided
    if (options?.vdrs) {
      for (const vdr of options.vdrs) {
        this.registerVDR(vdr);
      }
    }
  }

  // Factory methods
  /**
   * Create an instance from an existing DID (for managing existing DIDs)
   */
  static async fromExistingDID(
    did: string,
    vdrs: VDRInterface[],
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface
    }
  ): Promise<NuwaIdentityKit> {
    // Find suitable VDR
    const didMethod = did.split(':')[1];
    const vdr = vdrs.find(v => v.getMethod() === didMethod);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${didMethod}'`);
    }

    // Resolve DID to get DID Document
    const didDocument = await vdr.resolve(did);
    if (!didDocument) {
      throw new Error(`Failed to resolve DID ${did}`);
    }

    return new NuwaIdentityKit(didDocument, {
      ...options,
      vdrs: [vdr]
    });
  }

  /**
   * Create an instance from a DID Document (for scenarios with known DID Document)
   */
  static fromDIDDocument(
    didDocument: DIDDocument,
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface,
      vdrs?: VDRInterface[]
    }
  ): NuwaIdentityKit {
    return new NuwaIdentityKit(didDocument, options);
  }

  /**
   * Create and publish a new DID
   */
  static async createNewDID(
    creationRequest: DIDCreationRequest,
    vdr: VDRInterface,
    signer: SignerInterface
  ): Promise<NuwaIdentityKit> {
    const result = await vdr.create(creationRequest);
    if (!result.success || !result.did) {
      throw new Error(`Failed to create DID: ${result.error || 'Unknown error'}`);
    }

    // If VDR didn't return DID Document, try to resolve it
    const didDocument = result.didDocument || await vdr.resolve(result.did);
    if (!didDocument) {
      throw new Error(`Failed to get DID Document for ${result.did}`);
    }

    return new NuwaIdentityKit(didDocument, {
      externalSigner: signer,
      vdrs: [vdr]
    });
  } 

  // VDR Management
  registerVDR(vdr: VDRInterface): NuwaIdentityKit {
    const method = vdr.getMethod();
    this.vdrRegistry.set(method, vdr);
    return this;
  }

  getVDR(method: string): VDRInterface | undefined {
    return this.vdrRegistry.get(method);
  }

  // Verification Method Management
  async addVerificationMethod(
    keyInfo: OperationalKeyInfo,
    relationships: VerificationRelationship[],
    options: {
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<string> {
    const keyIdFragment = keyInfo.idFragment || `key-${Date.now()}`;
    const keyId = `${this.didDocument.id}#${keyIdFragment}`;

    let verificationMethodEntry: any;
    if (keyInfo.publicKeyMaterial instanceof Uint8Array) {
      verificationMethodEntry = {
        id: keyId,
        type: keyInfo.type,
        controller: keyInfo.controller || this.didDocument.id,
        publicKeyMultibase: await CryptoUtils.publicKeyToMultibase(keyInfo.publicKeyMaterial, keyInfo.type),
        expires: keyInfo.expires,
      };
    } else {
      verificationMethodEntry = {
        id: keyId,
        type: keyInfo.type,
        controller: keyInfo.controller || this.didDocument.id,
        publicKeyJwk: keyInfo.publicKeyMaterial as JsonWebKey,
        expires: keyInfo.expires,
      };
    }

    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }

    const published = await vdr.addVerificationMethod(
      this.didDocument.id,
      verificationMethodEntry,
      relationships,
      {
        keyId: options.keyId,
        signer: options.signer || this.externalSigner
      }
    );

    if (!published) {
      throw new Error(`Failed to publish verification method ${keyId}`);
    }

    // Update local state
    if (!this.didDocument.verificationMethod) {
      this.didDocument.verificationMethod = [];
    }
    // Remove any existing verification method with the same ID
    this.didDocument.verificationMethod = this.didDocument.verificationMethod.filter(vm => vm.id !== verificationMethodEntry.id);
    this.didDocument.verificationMethod.push(verificationMethodEntry);

    relationships.forEach(rel => {
      if (!this.didDocument[rel]) {
        this.didDocument[rel] = [];
      }
      // Remove any existing relationship with the same ID
      this.didDocument[rel] = (this.didDocument[rel] as string[]).filter(id => id !== keyId);
      (this.didDocument[rel] as string[]).push(keyId);
    });

    return keyId;
  }

  async removeVerificationMethod(
    keyId: string,
    options: {
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<boolean> {
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }

    const published = await vdr.removeVerificationMethod(
      this.didDocument.id,
      keyId,
      {
        keyId: options.keyId,
        signer: options.signer || this.externalSigner
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
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<boolean> {
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }

    const published = await vdr.updateRelationships(
      this.didDocument.id,
      keyId,
      addRelationships,
      removeRelationships,
      {
        keyId: options.keyId,
        signer: options.signer || this.externalSigner
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
    options: {
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<string> {
    const serviceId = `${this.didDocument.id}#${serviceInfo.idFragment}`;
    const serviceEntry = {
      id: serviceId,
      type: serviceInfo.type,
      serviceEndpoint: serviceInfo.serviceEndpoint,
      ...(serviceInfo.additionalProperties || {}),
    };

    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }

    const published = await vdr.addService(
      this.didDocument.id,
      serviceEntry,
      {
        keyId: options.keyId,
        signer: options.signer || this.externalSigner
      }
    );

    if (!published) {
      throw new Error(`Failed to publish service ${serviceId}`);
    }

    // Update local state
    if (!this.didDocument.service) {
      this.didDocument.service = [];
    }
    // Remove any existing service with the same ID
    this.didDocument.service = this.didDocument.service.filter(s => s.id !== serviceId);
    this.didDocument.service.push(serviceEntry);

    return serviceId;
  }

  async removeService(
    serviceId: string,
    options: {
      keyId: string;
      signer?: SignerInterface;
    }
  ): Promise<boolean> {
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }

    const published = await vdr.removeService(
      this.didDocument.id,
      serviceId,
      {
        keyId: options.keyId,
        signer: options.signer || this.externalSigner
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

    const isMasterKey = verificationMethod.controller === this.didDocument.id;
    let signatureValue: string;

    if (isMasterKey && this.externalSigner) {
      const canSign = await this.externalSigner.canSign(keyId);
      if (!canSign) {
        throw new Error(`External signer cannot sign with master key ${keyId}`);
      }
      signatureValue = await this.externalSigner.sign(dataToSign, keyId);
    } else {
      const privateKey = this.operationalPrivateKeys.get(keyId);
      if (!privateKey) {
        throw new Error(`Private key for keyId ${keyId} not found and no suitable external signer is available.`);
      }
      signatureValue = await CryptoUtils.sign(dataToSign, privateKey, keyType);
    }

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

    // Check key expiration
    if (verificationMethod.expires) {
      const expiryDate = new Date(verificationMethod.expires);
      if (expiryDate.getTime() < Date.now()) {
        console.warn(`Key ${signature.key_id} has expired.`);
        return false;
      }
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
    const vdr = this.vdrRegistry.get(didMethod);
    
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
    const vdr = this.vdrRegistry.get(didMethod);
    
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
  getExternalSigner(): SignerInterface | undefined {
    return this.externalSigner;
  }

  async canSignWithKey(keyId: string): Promise<boolean> {
    if (this.operationalPrivateKeys.has(keyId)) {
      return true;
    }
    
    if (this.externalSigner) {
      return await this.externalSigner.canSign(keyId);
    }
    
    return false;
  }

  isDelegatedMode(): boolean {
    return this.externalSigner === undefined;
  }

  // Private Key Management Methods
  private storeOperationalPrivateKey(keyId: string, privateKey: CryptoKey | Uint8Array): void {
    this.operationalPrivateKeys.set(keyId, privateKey);
  }

  private getOperationalPrivateKey(keyId: string): CryptoKey | Uint8Array | undefined {
    return this.operationalPrivateKeys.get(keyId);
  }
} 