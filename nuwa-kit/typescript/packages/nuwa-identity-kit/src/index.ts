import { DIDDocument, MasterIdentity, CreateMasterIdentityOptions, OperationalKeyInfo, VerificationRelationship, ServiceInfo, NIP1SignedObject, SignedData, NIP1Signature, SignerInterface, VDRInterface, ServiceEndpoint, CadopIdTokenClaims, CadopOnboardingRequest } from './types';
import { CryptoUtils } from './cryptoUtils';

/**
 * Main SDK class for implementing NIP-1 Agent Single DID Multi-Key Model
 * Also supports NIP-3 delegation model where the DID controller can be another agent
 * 
 * This SDK follows security best practices by:
 * 1. Not storing the master private key directly (should be managed by a secure wallet)
 * 2. Supporting external signing for master key operations (via SignerInterface)
 * 3. Only managing operational keys that are explicitly provided
 * 
 * Usage Pattern:
 * - Use `publishDIDDocument` ONLY for the initial creation of a DID document
 * - For all updates, use the specific granular methods:
 *   - addVerificationMethodAndPublish: Add a new key
 *   - removeVerificationMethodAndPublish: Remove an existing key
 *   - addServiceAndPublish: Add a service endpoint
 *   - removeServiceAndPublish: Remove a service endpoint
 *   - updateRelationships: Update key relationships
 */
export class NuwaIdentityKit {
  private didDocument: DIDDocument;
  private operationalPrivateKeys: Map<string, CryptoKey | Uint8Array> = new Map(); // keyId -> privateKey
  private externalSigner?: SignerInterface; // Optional external signer for master key operations
  private vdrRegistry: Map<string, VDRInterface> = new Map(); // method -> VDR implementation

  /**
   * Create a new NuwaIdentityKit instance
   * @param didDocument The DID Document to manage
   * @param options Configuration options
   */
  constructor(
    didDocument: DIDDocument, 
    options?: {
      operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>,
      externalSigner?: SignerInterface,
      vdrs?: VDRInterface[]
    }
  ) {
    this.didDocument = didDocument;
    
    if (!options?.operationalPrivateKeys && !options?.externalSigner) {
      throw new Error("You must provide either operationalPrivateKeys or externalSigner to create a NuwaIdentityKit instance");
    }
    
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
  
  /**
   * Register a VDR implementation for a specific DID method
   * @param vdr The VDR implementation to register
   * @returns The NuwaIdentityKit instance (for method chaining)
   */
  registerVDR(vdr: VDRInterface): NuwaIdentityKit {
    const method = vdr.getMethod();
    this.vdrRegistry.set(method, vdr);
    return this;
  }
  
  /**
   * Get a registered VDR for a specific DID method
   * @param method The DID method
   * @returns The registered VDR or undefined if not found
   */
  getVDR(method: string): VDRInterface | undefined {
    return this.vdrRegistry.get(method);
  }

  /**
   * Creates a new NuwaIdentityKit instance in delegated mode (NIP-3)
   * In this mode, we don't have direct access to the master key operations and can only
   * use the operational keys that are explicitly provided.
   * 
   * @param didDocument The DID Document to manage
   * @param operationalPrivateKeys Optional map of operational private keys
   * @returns A new NuwaIdentityKit instance operating in delegated mode
   */
  static createDelegatedInstance(
    didDocument: DIDDocument, 
    operationalPrivateKeys?: Map<string, CryptoKey | Uint8Array>
  ): NuwaIdentityKit {
    return new NuwaIdentityKit(didDocument, { operationalPrivateKeys });
  }

  /**
   * Creates a new master identity (DID, DID Document, and master key pair).
   * This method does NOT store the master private key in the SDK instance.
   * Instead, it returns the key to the caller, who should handle it securely
   * (e.g., by storing it in a wallet or creating an external signer).
   */
  static async createMasterIdentity(options?: CreateMasterIdentityOptions): Promise<MasterIdentity> {
    const didMethod = options?.method || 'key'; // Default to did:key for simplicity
    let keyType = options?.initialOperationalKey?.type || 'Ed25519VerificationKey2020';
    
    // If keyCurve is specified, update the key type accordingly
    if (options?.keyCurve === 'secp256k1') {
      keyType = 'EcdsaSecp256k1VerificationKey2019';
    }
    
    const { publicKey: masterPubKeyMaterial, privateKey: masterPrivKey } = await CryptoUtils.generateKeyPair(keyType);

    let masterDid: string;
    let masterKeyId: string;
    let verificationMethodEntry: any;

    if (didMethod === 'key') {
      // For did:key, the DID is often derived from the public key itself.
      // The exact derivation depends on the specific did:key variant (e.g., Ed25519, P-256)
      // This is a simplified placeholder.
      const multibasePk = masterPubKeyMaterial instanceof Uint8Array 
        ? CryptoUtils.publicKeyToMultibase(masterPubKeyMaterial, keyType)
        : await CryptoUtils.jwkToMultibase(masterPubKeyMaterial as JsonWebKey);
      masterDid = `did:key:${multibasePk}`;
      
      // Use custom key ID fragment if provided, otherwise use the multibase-encoded public key
      const keyIdFragment = options?.masterKeyIdFragment || multibasePk;
      masterKeyId = `${masterDid}#${keyIdFragment}`;
    } else if (didMethod === 'web') {
      // For did:web, the DID is like did:web:example.com or did:web:example.com:path
      // This requires a domain name, which should be part of options.
      const domain = (options as any)?.domain || 'example.com'; // Should be passed in options
      masterDid = `did:web:${domain}`;
      masterKeyId = `${masterDid}#master`;
    } else {
      // For other methods or custom methods like did:rooch, a unique identifier is usually generated.
      masterDid = `did:${didMethod}:${Date.now()}${Math.random().toString().substring(2)}`; // Placeholder
      masterKeyId = `${masterDid}#master`;
    }

    if (masterPubKeyMaterial instanceof Uint8Array) {
      verificationMethodEntry = {
        id: masterKeyId,
        type: keyType,
        controller: masterDid,
        publicKeyMultibase: CryptoUtils.publicKeyToMultibase(masterPubKeyMaterial, keyType),
      };
    } else { // JWK
      verificationMethodEntry = {
        id: masterKeyId,
        type: keyType, // e.g. EcdsaSecp256k1VerificationKey2019 or JsonWebKey2020
        controller: masterDid,
        publicKeyJwk: masterPubKeyMaterial as JsonWebKey,
      };
    }

    const initialRelationships = options?.initialOperationalKey?.relationships || 
      ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation'];

    const didDoc: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        // Add other contexts if needed, e.g., for specific key types
        keyType === 'Ed25519VerificationKey2020' ? 'https://w3id.org/security/suites/ed25519-2020/v1' : 
        (keyType === 'EcdsaSecp256k1VerificationKey2019' || keyType === 'JsonWebKey2020') ? 
          'https://w3id.org/security/suites/jws-2020/v1' : ''
      ].filter(Boolean),
      id: masterDid,
      controller: masterDid,
      verificationMethod: [verificationMethodEntry],
    };

    initialRelationships.forEach(rel => {
      if (!didDoc[rel]) didDoc[rel] = [];
      (didDoc[rel] as string[]).push(masterKeyId);
    });

    return {
      did: masterDid,
      didDocument: didDoc,
      masterKeyId: masterKeyId,
      masterPrivateKey: masterPrivKey,
    };
  }

  /**
   * Adds a new operational key to the local DID document.
   * The DID document needs to be published separately.
   */
  async addOperationalKey(keyInfo: OperationalKeyInfo, relationships: VerificationRelationship[]): Promise<string> {
    const keyIdFragment = keyInfo.idFragment || `key-${Date.now()}`;
    const keyId = `${this.didDocument.id}#${keyIdFragment}`;

    let verificationMethodEntry: any;
    if (keyInfo.publicKeyMaterial instanceof Uint8Array) {
      verificationMethodEntry = {
        id: keyId,
        type: keyInfo.type,
        controller: keyInfo.controller || this.didDocument.id,
        publicKeyMultibase: CryptoUtils.publicKeyToMultibase(keyInfo.publicKeyMaterial, keyInfo.type),
        expires: keyInfo.expires,
      };
    } else { // JWK
      verificationMethodEntry = {
        id: keyId,
        type: keyInfo.type, // e.g. EcdsaSecp256k1VerificationKey2019 or JsonWebKey2020
        controller: keyInfo.controller || this.didDocument.id,
        publicKeyJwk: keyInfo.publicKeyMaterial as JsonWebKey,
        expires: keyInfo.expires,
      };
    }
    
    if (!this.didDocument.verificationMethod) {
      this.didDocument.verificationMethod = [];
    }
    this.didDocument.verificationMethod.push(verificationMethodEntry);

    relationships.forEach(rel => {
      if (!this.didDocument[rel]) {
        this.didDocument[rel] = [];
      }
      (this.didDocument[rel] as string[]).push(keyId);
    });
    
    // If the private key for this new operational key was generated externally and passed in,
    // it should be stored in this.operationalPrivateKeys by the caller.
    // If generated internally, it would be done here and stored.

    return keyId;
  }
  
  /**
   * Adds a new operational key to the DID document and publishes the change using a VDR.
   * This method both updates the local state and publishes the change to the VDR.
   * 
   * @param keyInfo Information about the operational key to add
   * @param relationships Verification relationships to associate with the key
   * @param signingKeyId ID of the key to use for signing the update (must have capabilityDelegation)
   * @param options Optional publishing options
   * @returns The ID of the added key
   */
  async addOperationalKeyAndPublish(
    keyInfo: OperationalKeyInfo,
    relationships: VerificationRelationship[],
    signingKeyId: string,
    options?: any
  ): Promise<string> {
    // First add the key to the local document
    const keyId = await this.addOperationalKey(keyInfo, relationships);
    
    // Get the didMethod to find the appropriate VDR
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    // Create the verification method object
    const verificationMethod = this.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Failed to find added verification method ${keyId} in local document`);
    }
    
    // Get signer - this could be from the options or from external signer
    const operationOptions = {
      ...options,
      keyId: signingKeyId,
      signer: options?.signer || this.externalSigner
    };
    
    // Publish the change using the VDR
    const published = await vdr.addVerificationMethod(
      this.didDocument.id,
      verificationMethod,
      relationships,
      operationOptions
    );
    
    if (!published) {
      // Rollback local change if publishing failed
      this.removeOperationalKey(keyId);
      throw new Error(`Failed to publish verification method ${keyId}`);
    }
    
    return keyId;
  }

  /**
   * Removes an operational key from the local DID document.
   * The DID document needs to be published separately.
   */
  removeOperationalKey(keyId: string): void {
    if (this.didDocument.verificationMethod) {
      this.didDocument.verificationMethod = this.didDocument.verificationMethod.filter(vm => vm.id !== keyId);
    }
    // Remove from all relationships
    const relationships: VerificationRelationship[] = ['authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation'];
    relationships.forEach(rel => {
      if (this.didDocument[rel]) {
        this.didDocument[rel] = (this.didDocument[rel] as any[]).filter(item => {
          if (typeof item === 'string') return item !== keyId;
          if (typeof item === 'object' && item.id) return item.id !== keyId; // Embedded VM
          return true;
        });
      }
    });
    this.operationalPrivateKeys.delete(keyId);
  }
  
  /**
   * Removes an operational key from the DID document and publishes the change using a VDR.
   * This method both updates the local state and publishes the change to the VDR.
   * 
   * @param keyId ID of the key to remove
   * @param signingKeyId ID of the key to use for signing the update (must have capabilityDelegation)
   * @param options Optional publishing options
   * @returns True if successful
   */
  async removeOperationalKeyAndPublish(
    keyId: string,
    signingKeyId: string,
    options?: any
  ): Promise<boolean> {
    // First check if the key exists
    const verificationMethod = this.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Verification method ${keyId} not found in local document`);
    }
    
    // Get the didMethod to find the appropriate VDR
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    // Get signer - this could be from the options or from external signer
    const operationOptions = {
      ...options,
      keyId: signingKeyId,
      signer: options?.signer || this.externalSigner
    };
    
    // Publish the change using the VDR
    const published = await vdr.removeVerificationMethod(
      this.didDocument.id,
      keyId,
      operationOptions
    );
    
    if (published) {
      // Remove from local state if publishing succeeded
      this.removeOperationalKey(keyId);
      return true;
    }
    
    throw new Error(`Failed to publish removal of verification method ${keyId}`);
  }

  /**
   * Adds a service description to the local DID document.
   * The DID document needs to be published separately.
   */
  addService(serviceInfo: ServiceInfo): string {
    const serviceId = `${this.didDocument.id}#${serviceInfo.idFragment}`;
    const serviceEntry: any = {
      id: serviceId,
      type: serviceInfo.type,
      serviceEndpoint: serviceInfo.serviceEndpoint,
      ...(serviceInfo.additionalProperties || {}),
    };

    if (!this.didDocument.service) {
      this.didDocument.service = [];
    }
    this.didDocument.service.push(serviceEntry);
    return serviceId;
  }
  
  /**
   * Adds a service to the DID document and publishes the change using a VDR.
   * This method both updates the local state and publishes the change to the VDR.
   * 
   * @param serviceInfo Information about the service to add
   * @param signingKeyId ID of the key to use for signing the update (must have capabilityInvocation)
   * @param options Optional publishing options
   * @returns The ID of the added service
   */
  async addServiceAndPublish(
    serviceInfo: ServiceInfo,
    signingKeyId: string,
    options?: any
  ): Promise<string> {
    // First add the service to the local document
    const serviceId = this.addService(serviceInfo);
    
    // Get the didMethod to find the appropriate VDR
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    // Create the service object
    const service = this.didDocument.service?.find(s => s.id === serviceId);
    if (!service) {
      throw new Error(`Failed to find added service ${serviceId} in local document`);
    }
    
    // Get signer - this could be from the options or from external signer
    const operationOptions = {
      ...options,
      keyId: signingKeyId,
      signer: options?.signer || this.externalSigner
    };
    
    // Publish the change using the VDR
    const published = await vdr.addService(
      this.didDocument.id,
      service,
      operationOptions
    );
    
    if (!published) {
      // Rollback local change if publishing failed
      this.removeService(serviceId);
      throw new Error(`Failed to publish service ${serviceId}`);
    }
    
    return serviceId;
  }

  /**
   * Removes a service description from the local DID document.
   * The DID document needs to be published separately.
   */
  removeService(serviceId: string): void {
    if (this.didDocument.service) {
      this.didDocument.service = this.didDocument.service.filter(s => s.id !== serviceId);
    }
  }
  
  /**
   * Removes a service from the DID document and publishes the change using a VDR.
   * This method both updates the local state and publishes the change to the VDR.
   * 
   * @param serviceId ID of the service to remove
   * @param signingKeyId ID of the key to use for signing the update (must have capabilityInvocation)
   * @param options Optional publishing options
   * @returns True if successful
   */
  async removeServiceAndPublish(
    serviceId: string,
    signingKeyId: string,
    options?: any
  ): Promise<boolean> {
    // First check if the service exists
    const service = this.didDocument.service?.find(s => s.id === serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found in local document`);
    }
    
    // Get the didMethod to find the appropriate VDR
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    // Get signer - this could be from the options or from external signer
    const operationOptions = {
      ...options,
      keyId: signingKeyId,
      signer: options?.signer || this.externalSigner
    };
    
    // Publish the change using the VDR
    const published = await vdr.removeService(
      this.didDocument.id,
      serviceId,
      operationOptions
    );
    
    if (published) {
      // Remove from local state if publishing succeeded
      this.removeService(serviceId);
      return true;
    }
    
    throw new Error(`Failed to publish removal of service ${serviceId}`);
  }
  
  /**
   * Updates the relationships of a verification method in the DID document
   * and publishes the change using a VDR.
   * 
   * @param keyId ID of the verification method to update
   * @param addRelationships Relationships to add
   * @param removeRelationships Relationships to remove
   * @param signingKeyId ID of the key to use for signing the update (must have capabilityDelegation)
   * @param options Optional publishing options
   * @returns True if successful
   */
  async updateRelationships(
    keyId: string,
    addRelationships: VerificationRelationship[],
    removeRelationships: VerificationRelationship[],
    signingKeyId: string,
    options?: any
  ): Promise<boolean> {
    // First check if the key exists
    const verificationMethod = this.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Verification method ${keyId} not found in local document`);
    }
    
    // Get the didMethod to find the appropriate VDR
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    // Get signer - this could be from the options or from external signer
    const operationOptions = {
      ...options,
      keyId: signingKeyId,
      signer: options?.signer || this.externalSigner
    };
    
    // Update local state
    if (addRelationships) {
      for (const rel of addRelationships) {
        if (!this.didDocument[rel]) {
          this.didDocument[rel] = [];
        }
        
        const relationshipArray = this.didDocument[rel] as (string | object)[];
        if (!relationshipArray.some(item => {
          return typeof item === 'string' ? item === keyId : (item as any).id === keyId;
        })) {
          relationshipArray.push(keyId);
        }
      }
    }
    
    if (removeRelationships) {
      for (const rel of removeRelationships) {
        if (this.didDocument[rel]) {
          this.didDocument[rel] = (this.didDocument[rel] as any[]).filter(item => {
            if (typeof item === 'string') return item !== keyId;
            if (typeof item === 'object' && item.id) return item.id !== keyId;
            return true;
          });
        }
      }
    }
    
    // Publish the change using the VDR
    const published = await vdr.updateRelationships(
      this.didDocument.id,
      keyId,
      addRelationships,  // Non-optional parameter now
      removeRelationships,  // Non-optional parameter now
      operationOptions
    );
    
    if (!published) {
      throw new Error(`Failed to publish relationship update for ${keyId}`);
    }
    
    return true;
  }

  /**
   * Signs data according to NIP-1 signature structure.
   * Uses either operational private keys stored in the SDK instance or an external signer.
   * 
   * @throws Error if the private key for the specified keyId is not available and no external signer is configured
   * @throws Error if the external signer cannot sign with the specified key
   */
  async createNIP1Signature(payload: Omit<SignedData, 'nonce' | 'timestamp'>, keyId: string): Promise<NIP1SignedObject> {
    // Find the verification method for the key
    const verificationMethod = this.didDocument.verificationMethod?.find(vm => vm.id === keyId);
    if (!verificationMethod) {
      throw new Error(`Verification method for keyId ${keyId} not found in DID document.`);
    }
    
    const keyType = verificationMethod.type;
    const signedData: SignedData = {
      ...payload,
      nonce: crypto.getRandomValues(new Uint32Array(1))[0].toString(), // Generate a random nonce
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Canonicalize signed_data (e.g., sort keys, consistent stringification)
    // For simplicity, using JSON.stringify with sorted keys (though a proper JCS might be better)
    const canonicalData = JSON.stringify(signedData, Object.keys(signedData).sort());
    const dataToSign = new TextEncoder().encode(canonicalData);

    // Determine how to sign based on key availability
    let signatureValue: string;
    
    // Check if it's a master key (controller matches DID)
    const isMasterKey = verificationMethod.controller === this.didDocument.id;
    
    if (isMasterKey && this.externalSigner) {
      // For master key operations, try to use the external signer if available
      const canSign = await this.externalSigner.canSign(keyId);
      if (!canSign) {
        throw new Error(`External signer cannot sign with master key ${keyId}`);
      }
      
      signatureValue = await this.externalSigner.sign(dataToSign, keyId);
    } else {
      // For operational keys or when no external signer is available
      const privateKey = this.operationalPrivateKeys.get(keyId);
      if (!privateKey) {
        throw new Error(`Private key for keyId ${keyId} not found and no suitable external signer is available.`);
      }
      
      signatureValue = await CryptoUtils.sign(dataToSign, privateKey, keyType);
    }

    const nip1Signature: NIP1Signature = {
      signer_did: this.didDocument.id,
      key_id: keyId,
      value: signatureValue,
    };

    return {
      signed_data: signedData,
      signature: nip1Signature,
    };
  }

  /**
   * Verifies a NIP-1 signature.
   * This typically involves resolving the signer's DID document first.
   * 
   * @param signedObject The NIP-1 signed object to verify
   * @param resolvedDidDocumentOrVDRs The resolved DID Document or an array of VDRs to use for resolution
   * @returns Promise resolving to true if the signature is valid
   */
  static async verifyNIP1Signature(
    signedObject: NIP1SignedObject,
    resolvedDidDocumentOrVDRs: DIDDocument | VDRInterface[]
  ): Promise<boolean> {
    const { signed_data, signature } = signedObject;
    let resolvedDidDocument: DIDDocument;

    // If we're given VDRs, use them to resolve the DID
    if (Array.isArray(resolvedDidDocumentOrVDRs)) {
      const did = signature.signer_did;
      const didMethod = did.split(':')[1];
      
      // Find a suitable VDR
      const vdr = resolvedDidDocumentOrVDRs.find(v => v.getMethod() === didMethod);
      if (!vdr) {
        console.error(`No VDR available for DID method '${didMethod}'`);
        return false;
      }
      
      // Resolve the DID
      const document = await vdr.resolve(did);
      if (!document) {
        console.error(`Failed to resolve DID ${did}`);
        return false;
      }
      
      resolvedDidDocument = document;
    } else {
      // Use the provided DID Document directly
      resolvedDidDocument = resolvedDidDocumentOrVDRs;
    }
    

    // 1. Verify timestamp (e.g., within a certain window, not too old)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - signed_data.timestamp) > 300) { // 5 minute window, adjust as needed
      console.warn('Timestamp out of valid window');
      return false;
    }

    // 2. Check nonce (requires verifier to maintain a list of used nonces for this signer_did/key_id)
    // This is a simplified check; a real implementation needs a nonce store.
    // For this example, we'll skip rigorous nonce checking.

    // 3. Resolve signer_did (already done, passed as resolvedDidDocument)
    if (resolvedDidDocument.id !== signature.signer_did) {
      console.error('Signer DID does not match resolved DID document ID');
      return false;
    }

    // 4. Find verificationMethod for key_id
    const verificationMethod = resolvedDidDocument.verificationMethod?.find(vm => vm.id === signature.key_id);
    if (!verificationMethod) {
      console.error(`Verification method ${signature.key_id} not found in DID document.`);
      return false;
    }

    // Check for key expiration if present
    if (verificationMethod.expires) {
      const expiryDate = new Date(verificationMethod.expires);
      if (expiryDate.getTime() < Date.now()) {
        console.warn(`Key ${signature.key_id} has expired.`);
        return false;
      }
    }

    // Extract public key material from the verification method
    let publicKeyMaterial: JsonWebKey | Uint8Array | null = null;
    
    if (verificationMethod.publicKeyJwk) {
      publicKeyMaterial = verificationMethod.publicKeyJwk;
    } else if (verificationMethod.publicKeyMultibase) {
      // In a real implementation, this would use proper multibase decoding
      // This is a simplified approach for demo purposes
      publicKeyMaterial = new TextEncoder().encode(verificationMethod.publicKeyMultibase.substring(1));
    }
    
    if (!publicKeyMaterial) {
      console.error('Public key material not found in verification method.');
      return false;
    }

    // 5. Verify signature.value with the public key
    const canonicalData = JSON.stringify(signed_data, Object.keys(signed_data).sort());
    const dataToVerify = new TextEncoder().encode(canonicalData);
    
    const isValid = await CryptoUtils.verify(dataToVerify, signature.value, publicKeyMaterial, verificationMethod.type);
    if (!isValid) {
      console.error('Signature verification failed.');
      return false;
    }

    // 6. (Optional) Check key_id against verification relationships for the specific operation
    // This depends on the `signed_data.operation` and application-specific logic.
    // Example: if (signed_data.operation === 'authenticateUser') { 
    //   if (!resolvedDidDocument.authentication?.some(auth => auth === signature.key_id || (typeof auth === 'object' && auth.id === signature.key_id))) {
    //     console.warn('Key not authorized for authentication.');
    //     return false;
    //   }
    // }

    return true;
  }

  /**
   * Finds a service by type in the current DID document.
   */
  findServiceByType(serviceType: string): any | undefined {
    return this.didDocument.service?.find(s => s.type === serviceType);
  }
  
  /**
   * CADOP Service Discovery Methods (NIP-3)
   */
  
  /**
   * Finds all CADOP Custodian services in the current DID document
   * @returns Array of CadopCustodianService entries
   */
  findCadopCustodianServices(): ServiceEndpoint[] {
    return this.didDocument.service?.filter(s => s.type === 'CadopCustodianService') || [];
  }
  
  /**
   * Finds all CADOP Identity Provider services in the current DID document
   * @returns Array of CadopIdPService entries
   */
  findCadopIdPServices(): ServiceEndpoint[] {
    return this.didDocument.service?.filter(s => s.type === 'CadopIdPService') || [];
  }
  
  /**
   * Finds all Web2 Proof services in the current DID document
   * @returns Array of Web2ProofServiceCADOP entries
   */
  findWeb2ProofServices(): ServiceEndpoint[] {
    return this.didDocument.service?.filter(s => s.type === 'Web2ProofServiceCADOP') || [];
  }
  
  /**
   * Discovers CADOP Custodian services from a given DID
   * @param custodianDid The DID of the potential custodian
   * @returns Promise resolving to array of CadopCustodianService entries
   */
  async discoverCadopCustodianServices(custodianDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDID(custodianDid);
    if (!didDocument) {
      return [];
    }
    
    return didDocument.service?.filter(s => s.type === 'CadopCustodianService') || [];
  }
  
  /**
   * Discovers CADOP Identity Provider services from a given DID
   * @param idpDid The DID of the potential identity provider
   * @returns Promise resolving to array of CadopIdPService entries
   */
  async discoverCadopIdPServices(idpDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDID(idpDid);
    if (!didDocument) {
      return [];
    }
    
    return didDocument.service?.filter(s => s.type === 'CadopIdPService') || [];
  }
  
  /**
   * Discovers Web2 Proof services from a given DID
   * @param providerDid The DID of the potential Web2 proof provider
   * @returns Promise resolving to array of Web2ProofServiceCADOP entries
   */
  async discoverWeb2ProofServices(providerDid: string): Promise<ServiceEndpoint[]> {
    const didDocument = await this.resolveDID(providerDid);
    if (!didDocument) {
      return [];
    }
    
    return didDocument.service?.filter(s => s.type === 'Web2ProofServiceCADOP') || [];
  }
  
  /**
   * Validates a CADOP Custodian service metadata structure
   * @param service The service endpoint to validate
   * @returns True if the service has valid CadopCustodianService metadata
   */
  static validateCadopCustodianService(service: ServiceEndpoint): boolean {
    if (service.type !== 'CadopCustodianService') {
      return false;
    }
    
    // Check required fields
    if (!service.serviceEndpoint || typeof service.serviceEndpoint !== 'string') {
      return false;
    }
    
    // Validate metadata if present
    if (service.metadata) {
      const metadata = service.metadata as any;
      
      // Validate auth_methods if present
      if (metadata.auth_methods && !Array.isArray(metadata.auth_methods)) {
        return false;
      }
      
      // Validate sybilLevel if present
      if (metadata.sybilLevel !== undefined && 
          (typeof metadata.sybilLevel !== 'number' || 
           metadata.sybilLevel < 0 || metadata.sybilLevel > 3)) {
        return false;
      }
      
      // Validate maxDailyMints if present
      if (metadata.maxDailyMints !== undefined && 
          (typeof metadata.maxDailyMints !== 'number' || metadata.maxDailyMints < 0)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validates a CADOP Identity Provider service metadata structure
   * @param service The service endpoint to validate
   * @returns True if the service has valid CadopIdPService metadata
   */
  static validateCadopIdPService(service: ServiceEndpoint): boolean {
    if (service.type !== 'CadopIdPService') {
      return false;
    }
    
    // Check required fields
    if (!service.serviceEndpoint || typeof service.serviceEndpoint !== 'string') {
      return false;
    }
    
    // Check required metadata
    if (!service.metadata || !service.metadata.jwks_uri) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Validates a Web2 Proof service metadata structure
   * @param service The service endpoint to validate
   * @returns True if the service has valid Web2ProofServiceCADOP metadata
   */
  static validateWeb2ProofService(service: ServiceEndpoint): boolean {
    if (service.type !== 'Web2ProofServiceCADOP') {
      return false;
    }
    
    // Check required fields
    if (!service.serviceEndpoint || typeof service.serviceEndpoint !== 'string') {
      return false;
    }
    
    // Validate metadata arrays if present
    if (service.metadata) {
      const metadata = service.metadata as any;
      
      if (metadata.accepts && !Array.isArray(metadata.accepts)) {
        return false;
      }
      
      if (metadata.supportedClaims && !Array.isArray(metadata.supportedClaims)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Returns the current DID document.
   */
  getDIDDocument(): DIDDocument {
    return JSON.parse(JSON.stringify(this.didDocument)); // Return a copy
  }

  /**
   * Publishes the initial DID document to its VDR.
   * Uses the appropriate registered VDR based on the DID method.
   * 
   * Note: This method should ONLY be used for the initial creation of the DID document.
   * For updates, use the specific methods like addVerificationMethodAndPublish, 
   * removeVerificationMethodAndPublish, etc.
   * 
   * @returns Promise resolving to true if successful, or throws an error
   * @throws Error if no VDR is registered for the DID method
   */
  async publishDIDDocument(): Promise<boolean> {
    const didMethod = this.didDocument.id.split(':')[1];
    const vdr = this.vdrRegistry.get(didMethod);
    
    if (!vdr) {
      throw new Error(`No VDR registered for DID method '${didMethod}'`);
    }
    
    console.log(`Publishing initial DID document for ${this.didDocument.id} using ${didMethod} VDR...`);
    
    try {
      // Store document in the appropriate VDR - only for initial creation
      const result = await vdr.store(this.didDocument);
      if (result) {
        console.log(`Initial DID Document for ${this.didDocument.id} successfully published.`);
      } else {
        console.warn(`Initial DID Document publication for ${this.didDocument.id} returned false.`);
      }
      return result;
    } catch (error) {
      console.error(`Failed to publish DID Document for ${this.didDocument.id}:`, error);
      throw new Error(`Failed to publish DID Document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates and publishes a DID document only if it doesn't already exist.
   * If the DID document already exists, this method will return false without making any changes.
   * 
   * @returns Promise resolving to true if the document was created and published, false if it already existed
   * @throws Error if no VDR is registered for the DID method or if publishing fails
   */
  async createAndPublishIfNotExists(): Promise<boolean> {
    const didExists = await this.didExists(this.didDocument.id);
    
    if (didExists) {
      console.log(`DID Document for ${this.didDocument.id} already exists. No changes made.`);
      return false;
    }
    
    return this.publishDIDDocument();
  }

  /**
   * Resolves a DID to its DID Document using the appropriate VDR.
   *
   * @param did The DID to resolve
   * @returns Promise resolving to the DID Document or null if not found
   * @throws Error if no VDR is registered for the DID method
   */
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

  /**
   * Checks if a DID exists in its VDR. Useful to determine whether to use publishDIDDocument (for initial creation)
   * or the specific update methods like addVerificationMethodAndPublish for updates.
   * 
   * @param did The DID to check
   * @returns Promise resolving to true if the DID exists, false otherwise
   * @throws Error if no VDR is registered for the DID method
   */
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

  /**
   * Stores an operational private key. 
   * Useful if keys are generated externally or need to be managed by the SDK instance.
   */
  storeOperationalPrivateKey(keyId: string, privateKey: CryptoKey | Uint8Array): void {
    this.operationalPrivateKeys.set(keyId, privateKey);
  }

  /**
   * Retrieves a stored operational private key. Use with caution.
   */
  getOperationalPrivateKey(keyId: string): CryptoKey | Uint8Array | undefined {
    return this.operationalPrivateKeys.get(keyId);
  }

  /**
   * Returns the external signer if configured
   * 
   * @returns The external signer instance, or undefined if not available
   */
  getExternalSigner(): SignerInterface | undefined {
    return this.externalSigner;
  }
  
  /**
   * Checks if the SDK has the ability to sign with a specific key
   * 
   * @param keyId The ID of the key to check
   * @returns A promise that resolves to true if the key can be used for signing
   */
  async canSignWithKey(keyId: string): Promise<boolean> {
    // Check if we have the private key directly
    if (this.operationalPrivateKeys.has(keyId)) {
      return true;
    }
    
    // Check if the external signer can sign with this key
    if (this.externalSigner) {
      return await this.externalSigner.canSign(keyId);
    }
    
    return false;
  }
  
  /**
   * Creates a SDK instance from a master identity with a simple built-in signer
   * This is a convenience method for testing and simple applications.
   * Production applications should implement a proper SignerInterface
   * that integrates with secure key storage solutions.
   * 
   * @param masterIdentity The master identity created with createMasterIdentity
   * @returns A new NuwaIdentityKit instance with a signer for the master key
   */
  static createFromMasterIdentity(masterIdentity: MasterIdentity): NuwaIdentityKit {
    // Create a simple signer that can sign with the master key
    const simpleSigner: SignerInterface = {
      async sign(data: Uint8Array, keyId: string): Promise<string> {
        if (keyId !== masterIdentity.masterKeyId) {
          throw new Error(`Simple signer can only sign with master key ${masterIdentity.masterKeyId}`);
        }
        
        // Find the verification method to get the key type
        const verificationMethod = masterIdentity.didDocument.verificationMethod?.find(
          vm => vm.id === masterIdentity.masterKeyId
        );
        
        if (!verificationMethod) {
          throw new Error(`Verification method not found for master key ${masterIdentity.masterKeyId}`);
        }
        
        return CryptoUtils.sign(data, masterIdentity.masterPrivateKey, verificationMethod.type);
      },
      
      async canSign(keyId: string): Promise<boolean> {
        return keyId === masterIdentity.masterKeyId;
      }
    };
    
    // Create and return the SDK instance
    return new NuwaIdentityKit(masterIdentity.didDocument, { externalSigner: simpleSigner });
  }
  
  /**
   * Checks if this SDK instance is operating in delegated mode (NIP-3)
   * In delegated mode, we don't have direct access to the master key operations.
   * 
   * @returns true if operating in delegated mode (no external signer available), false otherwise
   */
  isDelegatedMode(): boolean {
    return this.externalSigner === undefined;
  }
}

/**
 * CADOP (NIP-3) Utility Functions
 */
export class CadopUtils {
  /**
   * Generates a did:key from a public key in JWK format
   * @param publicKeyJwk The public key in JWK format
   * @returns The generated did:key string
   */
  static async generateDidKeyFromJwk(publicKeyJwk: JsonWebKey): Promise<string> {
    // Convert JWK to multibase format
    const multibasePk = await CryptoUtils.jwkToMultibase(publicKeyJwk);
    return `did:key:${multibasePk}`;
  }
  
  /**
   * Generates a did:key from raw public key bytes
   * @param publicKeyBytes The public key bytes
   * @param keyType The key type (e.g., 'Ed25519VerificationKey2020')
   * @returns The generated did:key string
   */
  static generateDidKeyFromBytes(publicKeyBytes: Uint8Array, keyType: string): string {
    const multibasePk = CryptoUtils.publicKeyToMultibase(publicKeyBytes, keyType);
    return `did:key:${multibasePk}`;
  }
  
  /**
   * Validates the consistency between a did:key and its corresponding public key in JWK format
   * @param didKey The did:key to validate
   * @param publicKeyJwk The public key in JWK format
   * @returns True if the did:key correctly corresponds to the public key
   */
  static async validateDidKeyConsistency(didKey: string, publicKeyJwk: JsonWebKey): Promise<boolean> {
    try {
      const expectedDidKey = await this.generateDidKeyFromJwk(publicKeyJwk);
      return didKey === expectedDidKey;
    } catch (error) {
      console.error('Error validating did:key consistency:', error);
      return false;
    }
  }
  
  /**
   * Creates a basic DID document for a did:key
   * @param didKey The did:key
   * @param publicKeyJwk The public key in JWK format
   * @param keyType The verification method type
   * @param relationships The verification relationships to assign to the key
   * @returns A basic DID document
   */
  static createDidKeyDocument(
    didKey: string, 
    publicKeyJwk: JsonWebKey, 
    keyType: string = 'JsonWebKey2020',
    relationships: VerificationRelationship[] = ['authentication', 'capabilityDelegation']
  ): DIDDocument {
    const keyId = `${didKey}#${didKey.split(':')[2]}`;
    
    const verificationMethod = {
      id: keyId,
      type: keyType,
      controller: didKey,
      publicKeyJwk: publicKeyJwk
    };
    
    const didDocument: DIDDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1'
      ],
      id: didKey,
      controller: didKey,
      verificationMethod: [verificationMethod]
    };
    
    // Add the key to specified relationships
    relationships.forEach(rel => {
      if (!didDocument[rel]) {
        didDocument[rel] = [];
      }
      (didDocument[rel] as string[]).push(keyId);
    });
    
    return didDocument;
  }
  
  /**
   * Validates CADOP ID Token claims structure (without signature verification)
   * @param claims The decoded ID token claims
   * @returns True if the claims structure is valid for CADOP
   */
  static validateCadopIdTokenClaims(claims: any): claims is CadopIdTokenClaims {
    // Check required fields
    const requiredFields = ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'nonce', 'pub_jwk', 'sybil_level'];
    
    for (const field of requiredFields) {
      if (!(field in claims)) {
        console.error(`Missing required claim: ${field}`);
        return false;
      }
    }
    
    // Validate types
    if (typeof claims.iss !== 'string' ||
        typeof claims.sub !== 'string' ||
        typeof claims.aud !== 'string' ||
        typeof claims.exp !== 'number' ||
        typeof claims.iat !== 'number' ||
        typeof claims.jti !== 'string' ||
        typeof claims.nonce !== 'string' ||
        typeof claims.pub_jwk !== 'object' ||
        typeof claims.sybil_level !== 'number') {
      console.error('Invalid claim types');
      return false;
    }
    
    // Validate sybil_level range
    if (claims.sybil_level < 0 || claims.sybil_level > 3) {
      console.error('Invalid sybil_level range');
      return false;
    }
    
    // Validate that sub is a did:key
    if (!claims.sub.startsWith('did:key:')) {
      console.error('Subject must be a did:key');
      return false;
    }
    
    return true;
  }
  
  /**
   * Validates the consistency between ID token claims (sub and pub_jwk)
   * @param claims The ID token claims
   * @returns True if sub (did:key) matches the pub_jwk
   */
  static async validateIdTokenSubjectKeyConsistency(claims: CadopIdTokenClaims): Promise<boolean> {
    return this.validateDidKeyConsistency(claims.sub, claims.pub_jwk);
  }
  
  /**
   * Checks if an ID token has expired
   * @param claims The ID token claims
   * @param clockSkewSeconds Allowed clock skew in seconds (default: 60)
   * @returns True if the token has expired
   */
  static isIdTokenExpired(claims: CadopIdTokenClaims, clockSkewSeconds: number = 60): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now > (claims.exp + clockSkewSeconds);
  }
  
  /**
   * Checks if an ID token is not yet valid (issued in the future)
   * @param claims The ID token claims
   * @param clockSkewSeconds Allowed clock skew in seconds (default: 60)
   * @returns True if the token is not yet valid
   */
  static isIdTokenNotYetValid(claims: CadopIdTokenClaims, clockSkewSeconds: number = 60): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now < (claims.iat - clockSkewSeconds);
  }
  
  /**
   * Creates a CADOP onboarding request payload
   * @param userDID The user's client-generated DID (typically did:key)
   * @param publicKey The user's public key
   * @param idToken The ID token from the CadopIdPService
   * @param web2ProofAttestations Optional additional VCs from Web2ProofService
   * @returns The CADOP onboarding request payload
   */
  static createCadopOnboardingRequest(
    userDID: string,
    publicKey: JsonWebKey | Uint8Array,
    idToken: string,
    web2ProofAttestations?: string[]
  ): CadopOnboardingRequest {
    return {
      userDID,
      initialAgentKey_pub: publicKey,
      idToken,
      web2ProofAttestations
    };
  }
  
  /**
   * Generates OIDC state parameter for CADOP flow
   * @param custodianDid The DID of the target custodian
   * @param nonce A random nonce for replay protection
   * @param additionalState Optional additional state parameters
   * @returns Base64URL-encoded state parameter
   */
  static generateOidcState(
    custodianDid: string, 
    nonce: string, 
    additionalState?: Record<string, any>
  ): string {
    const stateObject = {
      custodianDid,
      nonce,
      ...additionalState
    };
    
    const stateJson = JSON.stringify(stateObject);
    // Convert to base64url encoding
    return btoa(stateJson).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  
  /**
   * Parses OIDC state parameter for CADOP flow
   * @param state The Base64URL-encoded state parameter
   * @returns The parsed state object
   */
  static parseOidcState(state: string): { custodianDid: string; nonce: string; [key: string]: any } {
    try {
      // Convert from base64url to base64
      const base64 = state.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const stateJson = atob(padded);
      return JSON.parse(stateJson);
    } catch (error) {
      throw new Error(`Invalid state parameter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export all types and classes
export * from './types';
export { CryptoUtils } from './cryptoUtils';

// Export VDR implementations
export * from './vdr';
