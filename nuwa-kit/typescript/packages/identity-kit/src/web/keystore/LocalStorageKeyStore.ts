import { KeyStore, StoredKey } from '../../index';

/**
 * Browser LocalStorage implementation of KeyStore
 */
export class LocalStorageKeyStore implements KeyStore {
  private readonly prefix: string;

  constructor(options: { prefix?: string } = {}) {
    // Runtime check for browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      throw new Error('LocalStorageKeyStore is only available in browser environments with localStorage support');
    }
    
    this.prefix = options.prefix || 'nuwa_keystore_';
  }

  /**
   * List all key IDs stored in this KeyStore
   */
  async listKeyIds(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }

  /**
   * Load a key by ID, or all keys if no ID is provided
   */
  async load(keyId?: string): Promise<StoredKey | null> {
    if (!keyId) {
      const keys = await this.listKeyIds();
      if (keys.length === 0) {
        return null;
      }
      return this.load(keys[0]);
    }

    const stored = localStorage.getItem(this.prefix + keyId);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as StoredKey;
    } catch (e) {
      console.error('Failed to parse stored key:', e);
      return null;
    }
  }

  /**
   * Save a key to storage
   */
  async save(key: StoredKey): Promise<void> {
    localStorage.setItem(this.prefix + key.keyId, JSON.stringify(key));
  }

  /**
   * Clear a key from storage, or all keys if no ID is provided
   */
  async clear(keyId?: string): Promise<void> {
    if (!keyId) {
      const keys = await this.listKeyIds();
      for (const key of keys) {
        await this.clear(key);
      }
      return;
    }

    localStorage.removeItem(this.prefix + keyId);
  }

} 