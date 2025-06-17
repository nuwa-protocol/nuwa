import { SignerInterface } from '../types';
import { CryptoUtils } from '../cryptoUtils';
import { KEY_TYPE, KeyType } from '../types';
import { decodeRoochSercetKey, Keypair } from '@roochnetwork/rooch-sdk';

interface StoredKeyPair {
  keyId: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  type: KeyType;
}

/**
 * A local implementation of SignerInterface that manages keys in memory
 * This implementation is primarily for development and testing
 * For production use, consider using more secure key storage solutions
 */
export class LocalSigner implements SignerInterface {
  private keys: Map<string, StoredKeyPair> = new Map();
  private did: string;

  private constructor(did: string) {
    this.did = did;
  }

  /**
   * Generate a new key pair and add it to the signer
   * @param keyIdFragment Fragment for the key ID (e.g., 'key-1')
   * @param type The type of key to generate (defaults to Ed25519)
   * @returns The full key ID of the generated key
   * @throws Error if the key ID is already in use
   */
  async generateKey(keyIdFragment: string, type: KeyType = KEY_TYPE.ED25519): Promise<string> {
    const keyId = `${this.did}#${keyIdFragment}`;

    // Check if key ID is already in use
    if (this.keys.has(keyId)) {
      throw new Error(`Key ID ${keyId} is already in use`);
    }

    // Generate new key pair
    const keyPair = await CryptoUtils.generateKeyPair(type);

    // Store the key pair
    await this.addKeyPair(keyId, keyPair, type);

    return keyId;
  }

  /**
   * Internal method to add a key pair to the signer
   * @param keyId The ID of the key (e.g., 'did:example:123#key-1')
   * @param keyPair The key pair to add
   * @param type The type of the key
   */
  private async addKeyPair(
    keyId: string,
    keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
    type: KeyType
  ): Promise<void> {
    // Validate keyId format
    if (!keyId.startsWith(this.did)) {
      throw new Error(`Key ID ${keyId} does not match DID ${this.did}`);
    }

    this.keys.set(keyId, {
      keyId,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      type,
    });
  }

  /**
   * List all available key IDs
   * @returns Array of key IDs that this signer can use
   */
  async listKeyIds(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }

  /**
   * Sign data with a specified key
   * @param data The data to sign
   * @param keyId The ID of the key to use for signing
   * @returns The signature
   * @throws Error if the key is not found or signing fails
   */
  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }

    try {
      return await CryptoUtils.sign(data, key.privateKey, key.type);
    } catch (error) {
      throw new Error(
        `Failed to sign with key ${keyId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the signer can sign with a specific key
   * @param keyId The ID of the key to check
   * @returns True if the key exists and can be used for signing
   */
  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return this.keys.has(keyId);
  }

  /**
   * Get information about a specific key
   * @param keyId The ID of the key to get information about
   * @returns Key information or undefined if not found
   */
  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    const key = this.keys.get(keyId);
    if (!key) return undefined;
    return { type: key.type, publicKey: key.publicKey };
  }

  /**
   * Create a new LocalSigner with a generated Ed25519 key
   * @param did The DID to associate with the signer
   * @param keyIdFragment Optional fragment for the key ID (e.g., 'key-1')
   * @returns A new LocalSigner instance with a generated key
   */
  static async createWithNewKey(
    did: string,
    keyIdFragment: string = `key-${Date.now()}`
  ): Promise<{ signer: LocalSigner; keyId: string }> {
    const signer = new LocalSigner(did);
    const keyId = await signer.generateKey(keyIdFragment);
    return { signer, keyId };
  }

  /**
   * Create a new LocalSigner with a key pair
   * @param did The DID to associate with the signer
   * @param keyIdFragment Optional fragment for the key ID (e.g., 'account-key'), default is 'account-key'
   * @param keyPair The key pair to import
   * @param type The type of the key
   * @returns A new LocalSigner instance with the imported key
   */
  static async createWithKeyPair(
    did: string,
    keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
    keyIdFragment: string = `account-key`,
    type: KeyType = KEY_TYPE.ED25519
  ): Promise<{ signer: LocalSigner; keyId: string }> {
    const signer = new LocalSigner(did);
    const keyId = await signer.importKeyPair(keyIdFragment, keyPair, type);
    return { signer, keyId };
  }

  static async createWithDidKey(): Promise<{ signer: LocalSigner; keyId: string }> {
    const { publicKey, privateKey } = await CryptoUtils.generateKeyPair(KEY_TYPE.ED25519);
    const publicKeyMultibase = await CryptoUtils.publicKeyToMultibase(publicKey, KEY_TYPE.ED25519);
    const didKey = `did:key:${publicKeyMultibase}`;
    const signer = new LocalSigner(didKey);
    const keyId = await signer.importKeyPair(
      'account-key',
      { privateKey: privateKey, publicKey: publicKey },
      KEY_TYPE.ED25519
    );
    return { signer, keyId };
  }

  /**
   * Create a new LocalSigner with multiple generated keys
   * @param did The DID to associate with the signer
   * @param keyConfigs Array of key configurations
   * @returns A new LocalSigner instance with the generated keys
   */
  static async createWithMultipleKeys(
    did: string,
    keyConfigs: Array<{
      type: KeyType;
      fragment: string;
    }>
  ): Promise<{ signer: LocalSigner; keyIds: string[] }> {
    const signer = new LocalSigner(did);
    const keyIds: string[] = [];

    for (const config of keyConfigs) {
      const keyId = await signer.generateKey(config.fragment, config.type);
      keyIds.push(keyId);
    }

    return { signer, keyIds };
  }

  /**
   * Create an empty LocalSigner instance
   * Keys can be added later using generateKey
   * @param did The DID to associate with the signer
   * @returns A new LocalSigner instance with no keys
   */
  static createEmpty(did: string): LocalSigner {
    return new LocalSigner(did);
  }

  /**
   * Get the public key for a specific key ID
   * @param keyId The ID of the key
   * @returns The public key if found
   */
  async getPublicKey(keyId: string): Promise<Uint8Array | undefined> {
    return this.keys.get(keyId)?.publicKey;
  }

  /**
   * Import an existing key pair
   * @param keyIdFragment Fragment for the key ID (e.g., 'key-1')
   * @param keyPair The key pair to import
   * @param type The type of the key
   * @returns The full key ID
   * @throws Error if the key ID is already in use
   */
  async importKeyPair(
    keyIdFragment: string,
    keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
    type: KeyType = KEY_TYPE.ED25519
  ): Promise<string> {
    const keyId = `${this.did}#${keyIdFragment}`;

    // Check if key ID is already in use
    if (this.keys.has(keyId)) {
      throw new Error(`Key ID ${keyId} is already in use`);
    }
    //TODO verify the public key with the private key
    await this.addKeyPair(keyId, keyPair, type);

    return keyId;
  }

  async importRoochKeyPair(keyIdFragment: string, roochKeyPair: Keypair): Promise<string> {
    const keyId = `${this.did}#${keyIdFragment}`;
    const publicKey = roochKeyPair.getPublicKey().toBytes();
    const { secretKey, schema } = decodeRoochSercetKey(roochKeyPair.getSecretKey());
    let keyType = schema === 'Secp256k1' ? KEY_TYPE.SECP256K1 : KEY_TYPE.ED25519;
    await this.addKeyPair(keyId, { privateKey: secretKey, publicKey: publicKey }, keyType);
    return keyId;
  }

  /**
   * Get the DID of the signer
   * @returns The DID of the signer
   */
  getDid(): string {
    return this.did;
  }
}
