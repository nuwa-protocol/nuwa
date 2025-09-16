import { NuwaStore, UserEntry } from './NuwaStore';
import { AuthMethod } from './types';

/**
 * User Store
 *
 * Responsible for managing user data, including credentials, Agents, etc.
 */
export class UserStore {
  /**
   * Add credential to user (Passkey users only)
   * @param userDid User DID
   * @param credentialId WebAuthn credential ID
   */
  static addCredential(userDid: string, credentialId: string): void {
    const state = NuwaStore.getState();
    const now = NuwaStore.now();

    // Create new Passkey user if not exists
    if (!state.users[userDid]) {
      state.users[userDid] = {
        credentials: [],
        agents: [],
        createdAt: now,
        updatedAt: now,
        authMethod: 'passkey',
        authIdentifier: credentialId, // Use the first credential as identifier
      };
    }

    const user = state.users[userDid];

    // Ensure this is a Passkey user
    if (user.authMethod !== 'passkey') {
      throw new Error(`[UserStore] Cannot add credential to non-Passkey user: ${userDid}`);
    }

    // Add credential (deduplicate)
    if (!user.credentials.includes(credentialId)) {
      user.credentials.push(credentialId);

      // Update auth identifier if this is the first credential
      if (user.credentials.length === 1) {
        user.authIdentifier = credentialId;
      }
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

  /**
   * Find user DID by wallet address
   * @param address Wallet address
   * @returns User DID, null if not found
   */
  static findUserByWalletAddress(address: string): string | null {
    const targetDid = `did:rooch:${address}`;
    const state = NuwaStore.getState();
    return state.users[targetDid] ? targetDid : null;
  }

  /**
   * Add wallet user
   * @param userDid User DID (should be `did:rooch:${address}`)
   * @param address Wallet address
   */
  static addWalletUser(userDid: string, address: string): void {
    const state = NuwaStore.getState();
    const now = NuwaStore.now();

    // Validate DID format - support both rooch and bitcoin DIDs
    if (!userDid.startsWith('did:rooch:') && !userDid.startsWith('did:bitcoin:')) {
      throw new Error(
        `[UserStore] Invalid wallet DID format: ${userDid}. Expected did:rooch: or did:bitcoin:`
      );
    }

    // Ensure user doesn't already exist
    if (state.users[userDid]) {
      throw new Error(`[UserStore] Wallet user already exists: ${userDid}`);
    }

    // Create wallet user
    state.users[userDid] = {
      credentials: [], // Wallet users have no credentials
      agents: [],
      createdAt: now,
      updatedAt: now,
      authMethod: 'wallet',
      authIdentifier: address,
    };

    NuwaStore.saveState(state);
  }

  /**
   * Get authentication method for a user DID
   * @param userDid User DID
   * @returns Authentication method, null if user not found
   */
  static getAuthMethod(userDid: string): AuthMethod | null {
    // Infer from DID format
    if (userDid.startsWith('did:key:')) return 'passkey';
    if (userDid.startsWith('did:rooch:')) return 'wallet';
    if (userDid.startsWith('did:bitcoin:')) return 'wallet';
    return null;
  }

  /**
   * Extract wallet address from DID
   * @param userDid User DID
   * @returns Wallet address, null if not a wallet DID
   */
  static extractAddressFromDID(userDid: string): string | null {
    if (userDid.startsWith('did:rooch:')) {
      return userDid.replace('did:rooch:', '');
    }
    if (userDid.startsWith('did:bitcoin:')) {
      return userDid.replace('did:bitcoin:', '');
    }
    return null;
  }

  /**
   * Get authentication identifier for a user
   * @param userDid User DID
   * @returns Authentication identifier (credentialId for Passkey, address for Wallet)
   */
  static getAuthIdentifier(userDid: string): string | null {
    const user = this.getUser(userDid);
    return user?.authIdentifier || null;
  }
}
