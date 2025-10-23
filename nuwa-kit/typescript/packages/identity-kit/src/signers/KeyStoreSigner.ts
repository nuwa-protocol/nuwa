import { SignerInterface } from '../signers/types';
import { KeyType } from '../types/crypto';
import { KeyStore } from '../keys/KeyStore';
import { signWithKeyStore, canSignWithKeyStore, getKeyInfoFromKeyStore } from './keyStoreUtils';
import { IdentityKitErrorCode, createKeyManagementError } from '../errors';

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
  constructor(
    private keyStore: KeyStore,
    did?: string
  ) {
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
    return signWithKeyStore(this.keyStore, data, keyId);
  }

  /**
   * Check if a key is available for signing
   * @param keyId ID of the key to check
   * @returns True if the key exists and can be used for signing
   */
  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return canSignWithKeyStore(this.keyStore, keyId);
  }

  /**
   * Get the DID associated with this signer.
   */
  async getDid(): Promise<string> {
    if (this.did) return this.did;
    throw createKeyManagementError(
      IdentityKitErrorCode.DID_NOT_SET,
      'DID not initialised. setDid() must be called by KeyManager.',
      { operation: 'getDid' }
    );
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
    return getKeyInfoFromKeyStore(this.keyStore, keyId);
  }
}
