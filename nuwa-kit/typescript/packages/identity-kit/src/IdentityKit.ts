import {
  DIDDocument,
  VerificationMethod,
  VerificationRelationship,
  ServiceInfo,
  ServiceEndpoint,
} from './types/did';
import { SignerInterface } from './types/signer';
import { KeyTypeInput, KEY_TYPE, KeyType, OperationalKeyInfo } from './types/crypto';
import { VDRInterface, DIDCreationRequest } from './types/vdr';
import { VDRRegistry } from './VDRRegistry';
// Key management & crypto utilities
import { KeyStore, MemoryKeyStore } from './keys/KeyStore';
import { KeyManager } from './keys/KeyManager';
import { CryptoUtils } from './crypto';
import { DidKeyCodec } from './multibase';
import { createVDR, initRoochVDR } from './vdr';
import { BaseMultibaseCodec } from './multibase';
// Rooch SDK types (optional dependency path is runtime resolved)
// eslint-disable-next-line import/no-extraneous-dependencies
import { Secp256k1Keypair, Ed25519Keypair } from '@roochnetwork/rooch-sdk';

// Simplified initialization options for the high-level factory method introduced in v1 refactor
export interface IdentityKitInitOptions {
  /** DID method to use. Currently supported: 'key' | 'rooch' */
  method?: 'key' | 'rooch';
  /** Desired key type for master key – defaults to Ed25519 */
  keyType?: KeyTypeInput;
  /** Optional pre-constructed KeyStore implementation. If omitted and method === 'key' a MemoryKeyStore will be created automatically. */
  keyStore?: KeyStore;
  /** Rooch specific: target network (local | dev | test | main). Defaults to 'test'. */
  network?: 'local' | 'dev' | 'test' | 'main';
  /** Rooch specific: explicit RPC endpoint overriding the default derived from network. */
  rpcUrl?: string;
}

/**
 * Main SDK class for implementing NIP-1 Agent Single DID Multi-Key Model
 */
export class IdentityKit {
  private didDocument: DIDDocument;
  private vdr: VDRInterface;
  private signer: SignerInterface;

  // Private constructor, force use of factory methods
  private constructor(
    didDocument: DIDDocument,
    vdr: VDRInterface,
    signer: SignerInterface
  ) {
    this.didDocument = didDocument;
    this.vdr = vdr;
    this.signer = signer;
  }

  // Factory methods
  /**
   * Create an instance from an existing DID (for managing existing DIDs)
   */
  static async fromExistingDID(did: string, signer: SignerInterface): Promise<IdentityKit> {
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

    return new IdentityKit(didDocument, vdr, signer);
  }

  /**
   * Create an instance from a DID Document (for scenarios with known DID Document)
   */
  static fromDIDDocument(didDocument: DIDDocument, signer: SignerInterface): IdentityKit {
    const method = didDocument.id.split(':')[1];
    const vdr = VDRRegistry.getInstance().getVDR(method);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${method}'`);
    }

    return new IdentityKit(didDocument, vdr, signer);
  }

  /**
   * Create and publish a new DID
   */
  static async createNewDID(
    method: string,
    creationRequest: DIDCreationRequest,
    signer: SignerInterface,
    options?: Record<string, any>
  ): Promise<IdentityKit> {
    const registry = VDRRegistry.getInstance();
    const vdr = registry.getVDR(method);
    if (!vdr) {
      throw new Error(`No VDR available for DID method '${method}'`);
    }

    const result = await registry.createDID(method, creationRequest, options);
    if (!result.success || !result.didDocument) {
      throw new Error(`Failed to create DID: ${result.error || 'Unknown error'}`);
    }

    return new IdentityKit(result.didDocument, vdr, signer);
  }

  /**
   * Unified factory for quickly getting an `IdentityKit` instance with sane defaults.
   *
   *
   * Example usage:
   * ```ts
   * const kit = await IdentityKit.init({ method: 'rooch' });
   * ```
   */
  static async init(options: IdentityKitInitOptions = {}): Promise<IdentityKit> {
    const method = (options.method || 'rooch').toLowerCase();
    const keyType: KeyType = options.keyType ? (typeof options.keyType === 'string' ? options.keyType as KeyType : options.keyType) : KEY_TYPE.ED25519;

    // ---------------------------------------------------------------------
    // 1. Ensure a VDR is registered for the requested method
    // ---------------------------------------------------------------------
    const registry = VDRRegistry.getInstance();
    let vdr = registry.getVDR(method);

    if (!vdr) {
      if (method === 'rooch') {
        vdr = initRoochVDR(options.network || 'test', options.rpcUrl, registry);
      } else if (method === 'key') {
        // Leverage built-in factory
        vdr = createVDR('key');
        registry.registerVDR(vdr);
      } else {
        // Try generic factory fall-back – may throw for unsupported method
        vdr = createVDR(method);
        registry.registerVDR(vdr);
      }
    }

    //---------------------------------------------------------------------
    // 2. Prepare a Signer implementation (KeyManager for did:key, LocalSigner for did:rooch)
    //---------------------------------------------------------------------
    if (method === 'key') {
      // a) KeyStore / KeyManager setup ------------------------------------------------
      const store: KeyStore = options.keyStore || new MemoryKeyStore();
      const keyManager = new KeyManager({ store, defaultKeyType: keyType });

      // b) Generate a master key ------------------------------------------------------
      const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(keyType);
      const publicKeyMultibase = CryptoUtils.publicKeyToMultibase(publicKey, keyType);
      const did = DidKeyCodec.generateDidKey(publicKey, keyType);
      const keyId = `${did}#master`;

      // Persist key material inside KeyStore
      await store.save({
        keyId,
        keyType,
        publicKeyMultibase,
        privateKeyMultibase: BaseMultibaseCodec.encodeBase58btc(privateKey),
      });

      keyManager.setDid(did);

      // c) Publish DID via KeyVDR (purely local for did:key) -------------------------
      const createResult = await registry.createDID(method, {
        publicKeyMultibase,
        keyType,
        preferredDID: did,
        controller: did,
        initialRelationships: ['authentication', 'capabilityDelegation'],
      });

      if (!createResult.success || !createResult.didDocument) {
        throw new Error(`Failed to initialise did:key: ${createResult.error || 'unknown error'}`);
      }

      return new IdentityKit(createResult.didDocument, vdr!, keyManager);
    }

    if (method === 'rooch') {
      // Generate a Secp256k1 keypair (more common for Rooch) – fall back to Ed25519 if requested
      const useSecp = keyType === KEY_TYPE.SECP256K1;
      const keypair = useSecp ? Secp256k1Keypair.generate() : Ed25519Keypair.generate();

      const publicKeyBytes = keypair.getPublicKey().toBytes();
      const publicKeyMultibase = BaseMultibaseCodec.encodeBase58btc(publicKeyBytes);
      const address = keypair.getRoochAddress().toBech32Address();
      const did = `did:rooch:${address}`;

      // Use KeyManager with in-memory store to hold generated Rooch keypair
      const km = KeyManager.createEmpty(did);
      await km.importRoochKeyPair('account-key', keypair);

      // Create DID on-chain -----------------------------------------------------------
      const createResult = await registry.createDID(method, {
        publicKeyMultibase,
        keyType,
        preferredDID: did,
        controller: did,
        initialRelationships: ['authentication', 'capabilityDelegation'],
      }, {
        signer: km,
        keyId: `${did}#account-key`,
      });

      if (!createResult.success || !createResult.didDocument) {
        throw new Error(`Failed to create Rooch DID: ${createResult.error || 'unknown error'}`);
      }

      return new IdentityKit(createResult.didDocument, vdr!, km);
    }

    throw new Error(`Unsupported DID method: ${method}`);
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
    return this.findKeysWithRelationship(relationship).then(keys => keys[0]);
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
      .map(item => (typeof item === 'string' ? item : item.id))
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
    const signingKeyId =
      options?.keyId || (await this.findKeyWithRelationship('capabilityDelegation'));
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
      publicKeyMultibase:
        keyInfo.publicKeyMaterial instanceof Uint8Array
          ? await BaseMultibaseCodec.encodeBase58btc(keyInfo.publicKeyMaterial)
          : undefined,
      publicKeyJwk: !(keyInfo.publicKeyMaterial instanceof Uint8Array)
        ? keyInfo.publicKeyMaterial
        : undefined,
    };

    // 3. Call VDR interface
    const published = await this.vdr.addVerificationMethod(
      this.didDocument.id,
      verificationMethodEntry,
      relationships,
      {
        signer: this.signer,
        keyId: signingKeyId,
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
    const signingKeyId =
      options?.keyId || (await this.findKeyWithRelationship('capabilityDelegation'));
    if (!signingKeyId) {
      throw new Error('No key with capabilityDelegation permission available');
    }

    const published = await this.vdr.removeVerificationMethod(this.didDocument.id, keyId, {
      signer: this.signer,
    });

    if (published) {
      // Update local state
      if (this.didDocument.verificationMethod) {
        this.didDocument.verificationMethod = this.didDocument.verificationMethod.filter(
          vm => vm.id !== keyId
        );
      }

      const relationships: VerificationRelationship[] = [
        'authentication',
        'assertionMethod',
        'keyAgreement',
        'capabilityInvocation',
        'capabilityDelegation',
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
        signer: options.signer,
      }
    );

    if (published) {
      // Update local state
      addRelationships.forEach(rel => {
        if (!this.didDocument[rel]) {
          this.didDocument[rel] = [];
        }
        const relationshipArray = this.didDocument[rel] as (string | object)[];
        if (
          !relationshipArray.some(item => {
            return typeof item === 'string' ? item === keyId : (item as any).id === keyId;
          })
        ) {
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
    const signingKeyId =
      options?.keyId || (await this.findKeyWithRelationship('capabilityInvocation'));
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

    const published = await this.vdr.addService(this.didDocument.id, serviceEntry, {
      signer: this.signer,
      keyId: signingKeyId,
    });

    if (!published) {
      throw new Error(`Failed to publish service ${serviceId}`);
    }
    // Update local state
    this.didDocument = (await this.vdr.resolve(this.didDocument.id)) as DIDDocument;
    console.log('After addService', JSON.stringify(this.didDocument, null, 2));
    return serviceId;
  }

  async removeService(
    serviceId: string,
    options?: {
      keyId?: string;
    }
  ): Promise<boolean> {
    const signingKeyId =
      options?.keyId || (await this.findKeyWithRelationship('capabilityInvocation'));
    if (!signingKeyId) {
      throw new Error('No key with capabilityInvocation permission available');
    }

    const published = await this.vdr.removeService(this.didDocument.id, serviceId, {
      signer: this.signer,
      keyId: signingKeyId,
    });

    if (published) {
      // Update local state
      if (this.didDocument.service) {
        this.didDocument.service = this.didDocument.service.filter(s => s.id !== serviceId);
      }
      return true;
    }

    return false;
  }

  // Document Access
  getDIDDocument(): DIDDocument {
    return JSON.parse(JSON.stringify(this.didDocument));
  }

  // Service Discovery
  findServiceByType(serviceType: string): ServiceEndpoint | undefined {
    return this.didDocument.service?.find(s => s.type === serviceType);
  }

  findVerificationMethodsByRelationship(
    relationship: VerificationRelationship
  ): VerificationMethod[] {
    const relationships = this.didDocument[relationship] as (string | { id: string })[];
    if (!relationships?.length) {
      return [];
    }

    return relationships
      .map(item => (typeof item === 'string' ? item : item.id))
      .map(id =>
        this.didDocument.verificationMethod?.find(vm => vm.id === id)
      ) as VerificationMethod[];
  }

  // State Checks
  async canSignWithKey(keyId: string): Promise<boolean> {
    return this.signer.canSignWithKeyId(keyId);
  }

  private async updateLocalDIDDocument(): Promise<void> {
    this.didDocument = (await this.vdr.resolve(this.didDocument.id)) as DIDDocument;
    console.log('After updateLocalDIDDocument', JSON.stringify(this.didDocument, null, 2));
  }

  getSigner(): SignerInterface {
    return this.signer;
  }

  /**
   * Get all key IDs that are both present in DID document and available via Signer,
   * grouped by verification relationship.
   */
  async getAvailableKeyIds(): Promise<{ [key in VerificationRelationship]?: string[] }> {
    const relationships: VerificationRelationship[] = [
      'authentication',
      'assertionMethod',
      'keyAgreement',
      'capabilityInvocation',
      'capabilityDelegation',
    ];

    const availableFromSigner = await this.signer.listKeyIds();
    const result: { [key in VerificationRelationship]?: string[] } = {};

    for (const rel of relationships) {
      const relArray = this.didDocument[rel] as (string | { id: string })[] | undefined;
      if (!relArray?.length) continue;

      const ids = relArray
        .map(item => (typeof item === 'string' ? item : item.id))
        .filter(id => availableFromSigner.includes(id));

      if (ids.length) result[rel] = ids;
    }
    return result;
  }
}

export { IdentityKit as NuwaIdentityKit };