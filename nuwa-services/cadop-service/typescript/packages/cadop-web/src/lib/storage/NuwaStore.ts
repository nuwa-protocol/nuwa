import { StorageAdapter, defaultAdapter } from './StorageAdapter';
import { NuwaStateV2, UserEntryV2, NuwaStateV1 } from './types';
import { StorageMigration } from './StorageMigration';

// Export the current types as the default
export type UserEntry = UserEntryV2;
export type NuwaState = NuwaStateV2;

/**
 * Default empty state (v2)
 */
const DEFAULT_STATE: NuwaState = {
  version: 2,
  currentUserDid: null,
  users: {},
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
      const parsedState = JSON.parse(raw);

      // Handle version migration
      if (StorageMigration.needsMigration(parsedState.version || 1)) {
        console.info(
          `[NuwaStore] Migrating storage from v${parsedState.version || 1} to v${StorageMigration.getTargetVersion()}`
        );

        // Migrate from v1 to v2
        if (parsedState.version === 1 || !parsedState.version) {
          const v1State = parsedState as NuwaStateV1;
          const migratedState = StorageMigration.migrateV1ToV2(v1State);

          // Save the migrated state
          this.saveState(migratedState);
          return migratedState;
        }
      }

      const state = parsedState as NuwaState;

      // Ensure version compatibility
      if (state.version !== DEFAULT_STATE.version) {
        console.warn(`[NuwaStore] Version mismatch: ${state.version} vs ${DEFAULT_STATE.version}`);
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
