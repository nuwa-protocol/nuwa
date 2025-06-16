/**
 * StorageAdapter - Local storage adapter
 * 
 * The lowest level storage abstraction, responsible for raw JSON string read/write operations.
 * Default implementation is based on localStorage, can be replaced with IndexedDB or encrypted storage in the future.
 */

export interface StorageAdapter {
  /**
   * Get raw JSON string
   * @returns Stored string, or null if not exists
   */
  getRaw(): string | null;

  /**
   * Save raw JSON string
   * @param value String to save
   */
  setRaw(value: string): void;

  /**
   * Clear stored content
   */
  clear(): void;
}

/**
 * localStorage-based storage adapter implementation
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;

  /**
   * Create localStorage adapter
   * @param key Storage key name, defaults to 'nuwa:v1'
   */
  constructor(key: string = 'nuwa:v1') {
    this.key = key;
  }

  getRaw(): string | null {
    return localStorage.getItem(this.key);
  }

  setRaw(value: string): void {
    localStorage.setItem(this.key, value);
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}

/**
 * Default storage adapter instance
 */
export const defaultAdapter = new LocalStorageAdapter(); 