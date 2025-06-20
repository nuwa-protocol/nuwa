import { KeyStore, StoredKey } from '@nuwa-ai/identity-kit';

/**
 * IndexedDB implementation of KeyStore
 * Supports storing CryptoKey objects and direct signing
 */
export class IndexedDBKeyStore implements KeyStore {
  private readonly dbName: string;
  private readonly storeName: string;
  private db: IDBDatabase | null = null;

  constructor(
    options: {
      dbName?: string;
      storeName?: string;
    } = {}
  ) {
    this.dbName = options.dbName || 'nuwa_keystore';
    this.storeName = options.storeName || 'keys';
  }

  /**
   * Initialize the database connection
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'keyId' });
        }
      };
    });
  }

  /**
   * List all key IDs stored in this KeyStore
   */
  async listKeyIds(): Promise<string[]> {
    const db = await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result.map(key => key.toString()));
      };

      request.onerror = () => {
        reject(new Error('Failed to list keys'));
      };
    });
  }

  /**
   * Load a key by ID, or all keys if no ID is provided
   */
  async load(keyId?: string): Promise<StoredKey | null> {
    const db = await this.initDB();

    if (!keyId) {
      const keys = await this.listKeyIds();
      if (keys.length === 0) {
        return null;
      }
      return this.load(keys[0]);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(keyId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to load key: ${keyId}`));
      };
    });
  }

  /**
   * Save a key to storage
   */
  async save(key: StoredKey): Promise<void> {
    const db = await this.initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to save key: ${key.keyId}`));
      };
    });
  }

  /**
   * Clear a key from storage, or all keys if no ID is provided
   */
  async clear(keyId?: string): Promise<void> {
    const db = await this.initDB();

    if (!keyId) {
      const keys = await this.listKeyIds();
      for (const key of keys) {
        await this.clear(key);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(keyId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete key: ${keyId}`));
      };
    });
  }
  
} 