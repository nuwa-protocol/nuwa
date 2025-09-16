import { NuwaStateV1, NuwaStateV2, UserEntryV1, UserEntryV2 } from './types';

/**
 * Storage Migration Utilities
 *
 * Handles migration between different storage versions
 */
export class StorageMigration {
  /**
   * Migrate from v1 to v2 storage structure
   * @param v1State The v1 state to migrate
   * @returns Migrated v2 state
   */
  static migrateV1ToV2(v1State: NuwaStateV1): NuwaStateV2 {
    console.log('[StorageMigration] Migrating from v1 to v2...');

    const v2State: NuwaStateV2 = {
      version: 2,
      currentUserDid: v1State.currentUserDid,
      users: {},
    };

    // Migrate existing users (all are Passkey users in v1)
    for (const [userDid, userEntry] of Object.entries(v1State.users)) {
      const v2UserEntry: UserEntryV2 = {
        ...userEntry,
        authMethod: 'passkey',
        // Use the first credential as the auth identifier
        // In v1, all users are Passkey users and should have at least one credential
        authIdentifier: userEntry.credentials[0] || '',
      };

      v2State.users[userDid] = v2UserEntry;
    }

    console.log(
      `[StorageMigration] Migrated ${Object.keys(v2State.users).length} users from v1 to v2`
    );
    return v2State;
  }

  /**
   * Check if migration is needed
   * @param currentVersion Current storage version
   * @returns Whether migration is needed
   */
  static needsMigration(currentVersion: number): boolean {
    return currentVersion < 2;
  }

  /**
   * Get the target version after migration
   */
  static getTargetVersion(): number {
    return 2;
  }
}
