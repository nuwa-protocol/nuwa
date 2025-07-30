import { SignerInterface } from '../signers/types';
import { KeyType, roochSignatureSchemeToKeyType } from '../types/crypto';
import { CryptoUtils } from '../crypto';
import { KeyStore, StoredKey, MemoryKeyStore } from './KeyStore';
import { StoredKeyCodec } from './StoredKeyCodec';
import {
  signWithKeyStore,
  canSignWithKeyStore,
  getKeyInfoFromKeyStore,
} from '../signers/keyStoreUtils';
import { MultibaseCodec, KeyMultibaseCodec } from '../multibase';
import { decodeRoochSercetKey, Keypair } from '@roochnetwork/rooch-sdk';
import { getDidWithoutFragment } from '../utils/did';

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
  private defaultKeyType: KeyType;
  private did?: string;

  /**
   * Create a new KeyManager
   * @param options Configuration options
   */
  constructor(options?: KeyManagerOptions) {
    this.store = options?.store || new MemoryKeyStore();
    this.did = options?.did;
    this.defaultKeyType = options?.defaultKeyType || KeyType.ED25519;
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
    const publicKeyEncoded = MultibaseCodec.encodeBase58btc(keyPair.publicKey);
    const privateKeyEncoded = MultibaseCodec.encodeBase58btc(keyPair.privateKey);

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
    const didFromKey = getDidWithoutFragment(key.keyId);

    if (this.did && didFromKey !== this.did) {
      throw new Error(`Key belongs to a different DID: ${didFromKey}`);
    }

    if (!this.did) {
      this.did = didFromKey;
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
    return this.store.listKeyIds();
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
      this.did = getDidWithoutFragment(keyIds[0]);
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
    return signWithKeyStore(this.store, data, keyId);
  }

  /**
   * Check if a key is available for signing
   * @param keyId ID of the key to check
   * @returns True if the key exists and can be used for signing
   */
  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return canSignWithKeyStore(this.store, keyId);
  }

  /**
   * Get information about a specific key
   * @param keyId ID of the key to get information about
   * @returns Key information or undefined if not found
   */
  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    return getKeyInfoFromKeyStore(this.store, keyId);
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

  /** Create an empty KeyManager instance and bind DID */
  static createEmpty(did: string, store: KeyStore = new MemoryKeyStore()): KeyManager {
    const km = new KeyManager({ store });
    km.setDid(did);
    return km;
  }

  /** Create KeyManager and immediately generate a key */
  static async createWithNewKey(
    did: string,
    fragment = `key-${Date.now()}`,
    type: KeyType = KeyType.ED25519,
    store: KeyStore = new MemoryKeyStore()
  ): Promise<{ keyManager: KeyManager; keyId: string }> {
    const km = KeyManager.createEmpty(did, store);
    const stored = await km.generateKey(fragment, type);
    return { keyManager: km, keyId: stored.keyId };
  }

  /** Create KeyManager and import existing key pair */
  static async createWithKeyPair(
    did: string,
    keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
    fragment = 'account-key',
    type: KeyType = KeyType.ED25519,
    store: KeyStore = new MemoryKeyStore()
  ): Promise<{ keyManager: KeyManager; keyId: string }> {
    const km = KeyManager.createEmpty(did, store);
    const keyId = await km.importKeyPair(fragment, keyPair, type);
    return { keyManager: km, keyId };
  }

  /** Utility: generate did:key + master key */
  static async createWithDidKey(): Promise<{ keyManager: KeyManager; keyId: string; did: string }> {
    const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KeyType.ED25519);
    const publicKeyMultibase = KeyMultibaseCodec.encodeWithType(publicKey, KeyType.ED25519);
    const didKey = `did:key:${publicKeyMultibase}`;
    const km = KeyManager.createEmpty(didKey);
    const keyId = await km.importKeyPair('account-key', { privateKey, publicKey }, KeyType.ED25519);
    return { keyManager: km, keyId, did: didKey };
  }

  /** Instance helper: import raw key pair (Uint8Array) */
  async importKeyPair(
    fragment: string,
    keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
    type: KeyType = KeyType.ED25519
  ): Promise<string> {
    const did = await this.getDid();
    const keyId = `${did}#${fragment}`;

    if (await this.getKeyInfo(keyId)) {
      throw new Error(`Key ID ${keyId} already exists in store`);
    }

    await this.importKey({
      keyId,
      keyType: type,
      publicKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.publicKey),
      privateKeyMultibase: MultibaseCodec.encodeBase58btc(keyPair.privateKey),
    });

    return keyId;
  }

  /** Instance helper: import Rooch Keypair */
  async importRoochKeyPair(fragment: string, roochKeyPair: Keypair): Promise<string> {
    const { secretKey, schema } = decodeRoochSercetKey(roochKeyPair.getSecretKey());
    const keyType: KeyType = roochSignatureSchemeToKeyType(schema);
    return this.importKeyPair(
      fragment,
      {
        privateKey: secretKey,
        publicKey: roochKeyPair.getPublicKey().toBytes(),
      },
      keyType
    );
  }

  /**
   * Export a stored key to a base58btc encoded string
   * @param keyId The ID of the key to export
   * @returns base58btc encoded string representation of the StoredKey
   */
  async exportKeyToString(keyId: string): Promise<string> {
    const key = await this.getStoredKey(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }
    return StoredKeyCodec.encode(key);
  }

  /**
   * Import a StoredKey from a base58btc encoded string into the current KeyManager
   * @param serialized The base58btc encoded string representation of a StoredKey
   * @returns The imported StoredKey
   */
  async importKeyFromString(serialized: string): Promise<StoredKey> {
    const key = StoredKeyCodec.decode(serialized);
    await this.importKey(key);
    return key;
  }

  /**
   * Create a new KeyManager from a serialized StoredKey string
   * @param serialized The base58btc encoded string representation of a StoredKey
   * @param store Optional key store (defaults to MemoryKeyStore)
   * @returns A new KeyManager instance with the imported key
   */
  static async fromSerializedKey(
    serialized: string,
    store: KeyStore = new MemoryKeyStore()
  ): Promise<KeyManager> {
    const key = StoredKeyCodec.decode(serialized);
    const km = KeyManager.createEmpty(getDidWithoutFragment(key.keyId), store);
    await km.importKey(key);
    return km;
  }
}
