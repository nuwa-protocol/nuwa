// Signer interfaces and types

import { KeyType } from '../types/crypto';

/**
 * Interface for external signers that can be used for master key operations
 * This allows the SDK to request signatures from external systems (wallets, HSMs, etc.)
 * without directly managing the private keys
 */
export interface SignerInterface {
  /**
   * List all available key IDs that this signer can use
   * @returns Promise resolving to an array of key IDs
   */
  listKeyIds(): Promise<string[]>;

  /**
   * Signs data with a specified key
   * @param data The data to sign
   * @param keyId The ID of the key to use for signing
   * @returns A promise that resolves to the signature
   */
  signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array>;

  /**
   * Checks if the signer can sign with a specific key
   * @param keyId The ID of the key to check
   * @returns A promise that resolves to true if the signer can sign with the key
   */
  canSignWithKeyId(keyId: string): Promise<boolean>;

  /**
   * Get the DID of the signer
   * @returns The DID of the signer
   */
  getDid(): Promise<string>;

  /**
   * Get information about a specific key
   * @param keyId The ID of the key to get information about
   * @returns Key information or undefined if not found
   */
  getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined>;
} 