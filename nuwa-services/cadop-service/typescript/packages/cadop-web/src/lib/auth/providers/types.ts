import { AuthMethod } from '../../storage/types';

/**
 * Login options for authentication providers
 */
export interface LoginOptions {
  /** WebAuthn mediation mode (for Passkey) */
  mediation?: 'silent' | 'optional' | 'required';
  /** Additional provider-specific options */
  [key: string]: any;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** User DID */
  userDid: string;
  /** Whether this is a new user (first time login/registration) */
  isNewUser: boolean;
  /** Authentication method used */
  authMethod: AuthMethod;
  /** Authentication identifier */
  authIdentifier: string;
}

/**
 * Signer interface for unified signing operations
 */
export interface SignerInterface {
  /** Get the DID this signer is associated with */
  getDID(): string;

  /** Get the public key */
  getPublicKey(): Promise<Uint8Array>;

  /** Sign data */
  sign(data: Uint8Array): Promise<Uint8Array>;

  /** Get algorithm identifier */
  getAlgorithm(): string;

  /** Check if signer is available/connected */
  isAvailable(): Promise<boolean>;
}

/**
 * Authentication provider interface
 *
 * Each authentication method (Passkey, Wallet) implements this interface
 * Focuses on authentication and user management, not direct signing
 */
export interface AuthProvider {
  /** Authentication method type */
  readonly type: AuthMethod;

  /** Check if this authentication method is supported in current environment */
  isSupported(): Promise<boolean>;

  /**
   * Perform login/authentication
   * @param options Login options
   * @returns Authentication result
   */
  login(options?: LoginOptions): Promise<AuthResult>;

  /**
   * Perform logout/cleanup
   */
  logout(): Promise<void>;

  /**
   * Get current user identifier (DID)
   * @returns User DID, null if not authenticated
   */
  getUserDid(): string | null;

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean;

  /**
   * Get user identifier for a given User DID (e.g., credentialId, wallet address)
   * @param userDid User DID
   * @returns Authentication identifier
   */
  getUserIdentifier(userDid: string): string | null;

  /**
   * Optional: Create new user/DID for this authentication method
   * @returns Authentication result for new user
   */
  ensureUser?(): Promise<AuthResult>;

  /**
   * Optional: Try to restore previous session
   * @returns true if session restored successfully
   */
  restoreSession?(): Promise<boolean>;

  /**
   * Optional: Try silent authentication (without user interaction)
   * @returns Authentication result if successful, null otherwise
   */
  trySilentAuth?(): Promise<AuthResult | null>;
}

/**
 * Authentication provider factory function type
 */
export type AuthProviderFactory = () => Promise<AuthProvider>;

/**
 * Authentication provider registry
 */
export interface AuthProviderRegistry {
  /** Register an authentication provider */
  register(method: AuthMethod, factory: AuthProviderFactory): void;

  /** Get authentication provider */
  get(method: AuthMethod): Promise<AuthProvider>;

  /** Get all supported authentication methods */
  getSupportedMethods(): Promise<AuthMethod[]>;
}
