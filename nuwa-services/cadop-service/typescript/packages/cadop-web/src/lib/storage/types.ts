/**
 * Authentication method types
 */
export type AuthMethod = 'passkey' | 'wallet';

/**
 * User entry for v2 storage structure
 */
export interface UserEntryV2 {
  /** WebAuthn credentialId list (only for Passkey users) */
  credentials: string[];
  /** User's Agent DID list */
  agents: string[];
  /** Creation timestamp (Unix timestamp, seconds) */
  createdAt: number;
  /** Last update timestamp (Unix timestamp, seconds) */
  updatedAt: number;
  /** Authentication method for this User DID */
  authMethod: AuthMethod;
  /** Authentication identifier (credentialId for Passkey, address for Wallet) */
  authIdentifier: string;
}

/**
 * Nuwa local storage state structure v2
 */
export interface NuwaStateV2 {
  /** Data structure version number */
  version: number;
  /** Current logged-in user's DID, null if not logged in */
  currentUserDid: string | null;
  /** User information mapping table, key is userDid */
  users: Record<string, UserEntryV2>;
}

/**
 * Legacy v1 types for migration
 */
export interface UserEntryV1 {
  credentials: string[];
  agents: string[];
  createdAt: number;
  updatedAt: number;
}

export interface NuwaStateV1 {
  version: number;
  currentUserDid: string | null;
  users: Record<string, UserEntryV1>;
}
