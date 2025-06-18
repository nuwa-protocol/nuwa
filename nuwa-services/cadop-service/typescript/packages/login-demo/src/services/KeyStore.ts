/**
 * KeyStore - Local storage for cryptographic keys and DID information
 */
import { BaseMultibaseCodec } from '@nuwa-ai/identity-kit';

const STORAGE_KEY = 'nuwa-login-demo:keystore';

export interface StoredKey {
  keyId: string;         // Full verification method ID (e.g., did:rooch:0x123#key-456)
  agentDid: string;      // Agent DID (e.g., did:rooch:0x123)
  publicKey: string;     // Base58btc encoded public key
  privateKey: string;    // Base58btc encoded private key (in production, should be encrypted)
}

/**
 * KeyStore for managing cryptographic keys
 */
export const KeyStore = {
  /**
   * Get stored key information
   * @returns Stored key or null if not found
   */
  get(): StoredKey | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data) as StoredKey;
    } catch (err) {
      console.error('Failed to read from KeyStore:', err);
      return null;
    }
  },

  /**
   * Save key information to local storage
   * @param key - Key information to save
   */
  save(key: StoredKey): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(key));
    } catch (err) {
      console.error('Failed to save to KeyStore:', err);
    }
  },

  /**
   * Clear stored key information
   */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear KeyStore:', err);
    }
  },

  /**
   * Check if a key is stored
   * @returns True if a key is stored
   */
  hasKey(): boolean {
    return this.get() !== null;
  },

  /**
   * Store a new key pair with DID information
   * @param keyId - Full verification method ID
   * @param agentDid - Agent DID
   * @param publicKey - Raw public key bytes
   * @param privateKey - Raw private key bytes
   */
  storeKeyPair(
    keyId: string,
    agentDid: string,
    publicKey: Uint8Array,
    privateKey: Uint8Array
  ): void {
    const storedKey: StoredKey = {
      keyId,
      agentDid,
      publicKey: BaseMultibaseCodec.encodeBase58btc(publicKey),
      privateKey: BaseMultibaseCodec.encodeBase58btc(privateKey),
    };
    this.save(storedKey);
  },
}; 