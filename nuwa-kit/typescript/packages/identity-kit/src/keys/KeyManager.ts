import { SignerInterface, KeyType } from '../types';
import { KeyStore, StoredKey, MemoryKeyStore } from './KeyStore';
import { KeyStoreSigner } from '../signers/KeyStoreSigner';
import { CryptoUtils } from '../cryptoUtils';
import { BaseMultibaseCodec } from '../multibase';

/**
 * Options for initializing a KeyManager
 */
export interface KeyManagerOptions {
  /** The key store to use (defaults to MemoryKeyStore) */
  store?: KeyStore;
  /** Default key type to use when generating keys (defaults to Ed25519) */
  defaultKeyType?: KeyType;
  /** DID to associate with keys */
  did?: string;
}

/**
 * KeyManager provides unified key lifecycle management
 * It implements SignerInterface and delegates to an underlying KeyStoreSigner
 */
export class KeyManager implements SignerInterface {
  private store: KeyStore;
  private signer: KeyStoreSigner;
  private defaultKeyType: KeyType;
  private did?: string;

  /**
   * Create a new KeyManager
   * @param options Configuration options
   */
  constructor(options?: KeyManagerOptions) {
    this.store = options?.store || new MemoryKeyStore();
    this.did = options?.did;
    this.signer = new KeyStoreSigner(this.store, this.did);
    this.defaultKeyType = options?.defaultKeyType || 'Ed25519VerificationKey2020';
  }

  /**
   * Generate a new key and store it
   * @param fragment Optional fragment for the key ID (e.g., 'key-1')
   * @param keyType Optional key type (defaults to the manager's defaultKeyType)
   * @returns The stored key information
   */
  async generateKey(fragment?: string, keyType?: KeyType): Promise<StoredKey> {
    if (!this.did) {
      throw new Error('DID must be set before generating keys');
    }

    const type = keyType || this.defaultKeyType;
    const keyPair = await CryptoUtils.generateKeyPair(type);

    // Create a key ID with the provided fragment or a timestamp
    const keyFragment = fragment || `key-${Date.now()}`;
    const keyId = `${this.did}#${keyFragment}`;

    // Encode the keys
    const publicKeyEncoded = BaseMultibaseCodec.encodeBase58btc(keyPair.publicKey);
    const privateKeyEncoded = BaseMultibaseCodec.encodeBase58btc(keyPair.privateKey);

    // Create the stored key
    const storedKey: StoredKey = {
      keyId,
      keyType: type,
      publicKeyMultibase: publicKeyEncoded,
      privateKeyMultibase: privateKeyEncoded,
    };

    // Save to the store
    await this.store.save(storedKey);

    return storedKey;
  }

  /**
   * Import an existing key into the store
   * @param key The key to import
   */
  async importKey(key: StoredKey): Promise<void> {
    const didFromKey = key.keyId.split('#')[0];

    if (this.did && didFromKey !== this.did) {
      throw new Error(`Key belongs to a different DID: ${didFromKey}`);
    }

    if (!this.did) {
      this.did = didFromKey;
      this.signer.setDid(this.did);
    }

    await this.store.save(key);
  }

  /**
   * Delete a key from the store
   * @param keyId ID of the key to delete
   */
  async deleteKey(keyId: string): Promise<void> {
    await this.store.clear(keyId);
  }

  /**
   * List all available key IDs
   */
  async listKeyIds(): Promise<string[]> {
    return this.signer.listKeyIds();
  }

  /**
   * Get a stored key by its ID
   * @param keyId ID of the key to retrieve
   * @returns The stored key or null if not found
   */
  async getStoredKey(keyId: string): Promise<StoredKey | null> {
    return this.store.load(keyId);
  }

  /**
   * Set the DID for this manager
   * @param did The DID to set
   */
  setDid(did: string): void {
    this.did = did;
    this.signer.setDid(did);
  }

  /**
   * Get the DID
   * @returns The DID
   */
  async getDid(): Promise<string> {
    if (this.did) return this.did;

    // Attempt to derive from stored keys
    const keyIds = await this.listKeyIds();
    if (keyIds.length > 0) {
      this.did = keyIds[0].split('#')[0];
      this.signer.setDid(this.did);
      return this.did;
    }

    // No DID found
    throw new Error('DID not initialised. Call setDid() or import a key first.');
  }

  /**
   * Sign data with a specific key
   * @param data Data to sign
   * @param keyId ID of the key to use
   * @returns The signature
   */
  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    return this.signer.signWithKeyId(data, keyId);
  }

  /**
   * Check if a key is available for signing
   * @param keyId ID of the key to check
   * @returns True if the key exists and can be used for signing
   */
  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return this.signer.canSignWithKeyId(keyId);
  }

  /**
   * Get information about a specific key
   * @param keyId ID of the key to get information about
   * @returns Key information or undefined if not found
   */
  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    return this.signer.getKeyInfo(keyId);
  }

  /**
   * Find the first key with a specific key type
   * @param keyType The key type to search for
   * @returns The key ID or undefined if not found
   */
  async findKeyByType(keyType: KeyType): Promise<string | undefined> {
    const keyIds = await this.listKeyIds();

    for (const keyId of keyIds) {
      const key = await this.getStoredKey(keyId);
      if (key && key.keyType === keyType) {
        return keyId;
      }
    }

    return undefined;
  }

  /**
   * Get the underlying key store
   * @returns The key store
   */
  getStore(): KeyStore {
    return this.store;
  }
}
