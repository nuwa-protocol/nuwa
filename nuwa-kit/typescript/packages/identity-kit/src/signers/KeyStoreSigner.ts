import { SignerInterface, KeyType } from '../types';
import { KeyStore, StoredKey } from '../keys/KeyStore';
import { CryptoUtils } from '../cryptoUtils';
import { MultibaseCodec } from '../multibase';

/**
 * A unified signer adapter that works with any KeyStore implementation
 * Implements the SignerInterface by delegating to an underlying KeyStore
 */
export class KeyStoreSigner implements SignerInterface {
  private did?: string;

  /**
   * Create a new KeyStoreSigner
   * @param keyStore The underlying key store to use
   * @param did The DID to associate with this signer
   */
  constructor(private keyStore: KeyStore, did?: string) {
    if (did) {
      this.did = did;
    }
  }

  /**
   * List all available key IDs in the underlying store
   */
  async listKeyIds(): Promise<string[]> {
    return this.keyStore.listKeyIds();
  }

  /**
   * Sign data using a specific key
   * @param data Data to sign
   * @param keyId ID of the key to use for signing
   * @returns Signature as Uint8Array
   */
  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    // If the keystore has a direct sign method (e.g., for WebAuthn or non-extractable keys)
    // use it directly
    if (typeof this.keyStore.sign === 'function') {
      return this.keyStore.sign(keyId, data);
    }

    // Otherwise, load the key and sign with it
    const key = await this.keyStore.load(keyId);
    if (!key) {
      throw new Error(`Key not found: ${keyId}`);
    }

    if (!key.privateKeyMultibase) {
      throw new Error(`No private key available for ${keyId}`);
    }

    // Decode the private key from its encoded form
    const privateKeyBytes = MultibaseCodec.decode(key.privateKeyMultibase);
    
    // Use CryptoUtils to sign with the private key
    return CryptoUtils.sign(data, privateKeyBytes, key.keyType);
  }

  /**
   * Check if a key is available for signing
   * @param keyId ID of the key to check
   * @returns True if the key exists and can be used for signing
   */
  async canSignWithKeyId(keyId: string): Promise<boolean> {
    // If the keystore has a direct sign method, trust it can sign
    if (typeof this.keyStore.sign === 'function') {
      const keyExists = await this.keyStore.load(keyId);
      return keyExists !== null;
    }

    // Otherwise, check if the key exists and has a private key
    const key = await this.keyStore.load(keyId);
    return !!(key && key.privateKeyMultibase);
  }

  /**
   * Get the DID associated with this signer.
   */
  async getDid(): Promise<string> {
    if (this.did) return this.did;
    throw new Error('DID not initialised. setDid() must be called by KeyManager.');
  }

  /**
   * Set the DID for this signer
   * @param did The DID to associate with this signer
   */
  setDid(did: string): void {
    this.did = did;
  }

  /**
   * Get information about a specific key
   * @param keyId ID of the key to get information about
   * @returns Key information or undefined if not found
   */
  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    const key = await this.keyStore.load(keyId);
    if (!key) {
      return undefined;
    }

    // Convert the public key from its encoded form
    const publicKeyBytes = MultibaseCodec.decode(key.publicKeyMultibase);
    
    return {
      type: key.keyType,
      publicKey: publicKeyBytes
    };
  }
} 