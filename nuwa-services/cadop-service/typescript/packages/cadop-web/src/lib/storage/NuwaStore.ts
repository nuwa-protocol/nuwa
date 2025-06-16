import { StorageAdapter, defaultAdapter } from './StorageAdapter';

/**
 * User entry, stores user-related information
 */
export interface UserEntry {
  /** WebAuthn credentialId list */
  credentials: string[];
  /** User's Agent DID list */
  agents: string[];
  /** Creation timestamp (Unix timestamp, seconds) */
  createdAt: number;
  /** Last update timestamp (Unix timestamp, seconds) */
  updatedAt: number;
}

/**
 * Nuwa local storage state structure
 */
export interface NuwaState {
  /** Data structure version number */
  version: number;
  /** Current logged-in user's DID, null if not logged in */
  currentUserDid: string | null;
  /** User information mapping table, key is userDid */
  users: Record<string, UserEntry>;
}

/**
 * Default empty state
 */
const DEFAULT_STATE: NuwaState = {
  version: 1,
  currentUserDid: null,
  users: {}
};

/**
 * Nuwa Storage Manager
 * 
 * Responsible for managing core state data, provides read/write methods
 */
export class NuwaStore {
  private static adapter: StorageAdapter = defaultAdapter;

  /**
   * Set storage adapter
   * @param adapter Custom storage adapter
   */
  static setAdapter(adapter: StorageAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Get current state
   * @returns Complete state object, returns default empty state if not exists
   */
  static getState(): NuwaState {
    const raw = this.adapter.getRaw();
    if (!raw) {
      return { ...DEFAULT_STATE };
    }

    try {
      const state = JSON.parse(raw) as NuwaState;
      // Ensure version compatibility
      if (state.version !== DEFAULT_STATE.version) {
        console.warn(`[NuwaStore] Version mismatch: ${state.version} vs ${DEFAULT_STATE.version}`);
        // Version migration logic can be added here in the future
      }
      return state;
    } catch (error) {
      console.error('[NuwaStore] Failed to parse storage data:', error);
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * Save state
   * @param state State object to save
   */
  static saveState(state: NuwaState): void {
    try {
      const json = JSON.stringify(state);
      this.adapter.setRaw(json);
    } catch (error) {
      console.error('[NuwaStore] Failed to save state:', error);
    }
  }

  /**
   * Clear all stored data
   */
  static clear(): void {
    this.adapter.clear();
  }

  /**
   * Get current Unix timestamp (seconds)
   */
  static now(): number {
    return Math.floor(Date.now() / 1000);
  }
} 