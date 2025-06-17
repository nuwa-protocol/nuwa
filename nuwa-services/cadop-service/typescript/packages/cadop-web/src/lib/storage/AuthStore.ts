import { NuwaStore } from './NuwaStore';

/**
 * Authentication Store
 *
 * Responsible for managing user login state, provides read/write operations for current user DID
 */
export class AuthStore {
  /**
   * Get current logged-in user's DID
   * @returns Current user DID, null if not logged in
   */
  static getCurrentUserDid(): string | null {
    const state = NuwaStore.getState();
    return state.currentUserDid;
  }

  /**
   * Set current logged-in user
   * @param did User DID
   * @throws If the specified DID does not exist in the user list
   */
  static setCurrentUserDid(did: string): void {
    const state = NuwaStore.getState();

    // Check if user exists
    if (did && !state.users[did]) {
      throw new Error(`[AuthStore] User does not exist: ${did}`);
    }

    state.currentUserDid = did;
    NuwaStore.saveState(state);
  }

  /**
   * Clear current user (logout)
   */
  static clearCurrentUser(): void {
    const state = NuwaStore.getState();
    state.currentUserDid = null;
    NuwaStore.saveState(state);
  }

  /**
   * Check if user is logged in
   * @returns Whether user is logged in
   */
  static isLoggedIn(): boolean {
    return !!this.getCurrentUserDid();
  }
}
