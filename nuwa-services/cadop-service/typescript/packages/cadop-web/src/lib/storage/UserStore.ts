import { NuwaStore, UserEntry } from './NuwaStore';

/**
 * User Store
 *
 * Responsible for managing user data, including credentials, Agents, etc.
 */
export class UserStore {
  /**
   * Add credential to user
   * @param userDid User DID
   * @param credentialId WebAuthn credential ID
   */
  static addCredential(userDid: string, credentialId: string): void {
    const state = NuwaStore.getState();
    const now = NuwaStore.now();

    // Create new user if not exists
    if (!state.users[userDid]) {
      state.users[userDid] = {
        credentials: [],
        agents: [],
        createdAt: now,
        updatedAt: now,
      };
    }

    const user = state.users[userDid];

    // Add credential (deduplicate)
    if (!user.credentials.includes(credentialId)) {
      user.credentials.push(credentialId);
    }

    // Update timestamp
    user.updatedAt = now;

    NuwaStore.saveState(state);
  }

  /**
   * Add Agent to user
   * @param userDid User DID
   * @param agentDid Agent DID
   */
  static addAgent(userDid: string, agentDid: string): void {
    const state = NuwaStore.getState();
    const now = NuwaStore.now();

    // Ensure user exists
    if (!state.users[userDid]) {
      throw new Error(`[UserStore] User does not exist: ${userDid}`);
    }

    const user = state.users[userDid];

    // Add Agent (deduplicate)
    if (!user.agents.includes(agentDid)) {
      user.agents.push(agentDid);
    }

    // Update timestamp
    user.updatedAt = now;

    NuwaStore.saveState(state);
  }

  /**
   * Get all Agent DIDs of a user
   * @param userDid User DID
   * @returns Agent DID list
   */
  static listAgents(userDid: string): string[] {
    const state = NuwaStore.getState();
    return state.users[userDid]?.agents || [];
  }

  /**
   * Get all credential IDs of a user
   * @param userDid User DID
   * @returns Credential ID list
   */
  static listCredentials(userDid: string): string[] {
    const state = NuwaStore.getState();
    return state.users[userDid]?.credentials || [];
  }

  /**
   * Get all user DIDs
   * @returns User DID list
   */
  static getAllUsers(): string[] {
    const state = NuwaStore.getState();
    return Object.keys(state.users);
  }

  /**
   * Get user information
   * @param userDid User DID
   * @returns User information, null if not exists
   */
  static getUser(userDid: string): UserEntry | null {
    const state = NuwaStore.getState();
    return state.users[userDid] || null;
  }

  /**
   * Find user DID by credential
   * @param credentialId Credential ID
   * @returns User DID, null if not found
   */
  static findUserByCredential(credentialId: string): string | null {
    const state = NuwaStore.getState();

    for (const [did, user] of Object.entries(state.users)) {
      if (user.credentials.includes(credentialId)) {
        return did;
      }
    }

    return null;
  }

  /**
   * Check if there are any credentials stored in the system
   * @returns true if at least one credential exists, false otherwise
   */
  static hasAnyCredential(): boolean {
    const state = NuwaStore.getState();

    for (const user of Object.values(state.users)) {
      if (user.credentials.length > 0) {
        return true;
      }
    }

    return false;
  }
}
