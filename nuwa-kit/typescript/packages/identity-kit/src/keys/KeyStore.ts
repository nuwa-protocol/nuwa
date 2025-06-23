import { KeyType } from '../types/crypto';

/**
 * Represents a stored cryptographic key with its metadata
 */
export interface StoredKey {
  /** Complete verification method ID (contains the DID + fragment) */
  keyId: string;
  /** Cryptographic curve/algorithm */
  keyType: KeyType;
  /** Multibase encoded public key */
  publicKeyMultibase: string;
  /** Optional multibase encoded private key */
  privateKeyMultibase?: string;
  /** Generic key-value metadata for implementation-specific extensions */
  meta?: Record<string, any>;
}

/**
 * Interface for key storage implementations
 * Different environments (browser, node, react-native) can provide their own implementations
 */
export interface KeyStore {
  /**
   * List all available key IDs in this store
   * @returns Promise resolving to array of key IDs
   */
  listKeyIds(): Promise<string[]>;

  /**
   * Load a key by its ID
   * @param keyId Optional key ID to load (if omitted, may return a default key)
   * @returns Promise resolving to the stored key or null if not found
   */
  load(keyId?: string): Promise<StoredKey | null>;

  /**
   * Save a key to storage
   * @param key The key to save
   */
  save(key: StoredKey): Promise<void>;

  /**
   * Clear a specific key or all keys
   * @param keyId Optional key ID to clear (if omitted, clears all keys)
   */
  clear(keyId?: string): Promise<void>;

  /**
   * Optional: Sign data directly using the specified key
   * Implementations for WebAuthn or non-extractable CryptoKeys should provide this
   * @param keyId ID of the key to use for signing
   * @param data Data to sign
   * @returns Signature as Uint8Array
   */
  sign?(keyId: string, data: Uint8Array): Promise<Uint8Array>;
}

/**
 * In-memory implementation of KeyStore
 * Useful for testing and SSR environments
 */
export class MemoryKeyStore implements KeyStore {
  private map = new Map<string, StoredKey>();

  /**
   * List all available key IDs in this store
   */
  async listKeyIds(): Promise<string[]> {
    return Array.from(this.map.keys());
  }

  /**
   * Load a key by its ID
   * @param keyId Key ID to load
   */
  async load(keyId?: string): Promise<StoredKey | null> {
    if (!keyId) {
      // Return first key if no specific ID requested
      const firstKey = Array.from(this.map.values())[0];
      return firstKey || null;
    }
    return this.map.get(keyId) || null;
  }

  /**
   * Save a key to in-memory storage
   * @param key The key to save
   */
  async save(key: StoredKey): Promise<void> {
    this.map.set(key.keyId, key);
  }

  /**
   * Clear a specific key or all keys
   * @param keyId Optional key ID to clear (if omitted, clears all keys)
   */
  async clear(keyId?: string): Promise<void> {
    if (keyId) {
      this.map.delete(keyId);
    } else {
      this.map.clear();
    }
  }

  // No sign implementation for MemoryKeyStore; relies on plaintext extraction.
}
