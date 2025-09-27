import { AuthProvider, AuthResult, LoginOptions } from './types';
import { AuthMethod } from '../../storage/types';
import { PasskeyService } from '../../passkey/PasskeyService';
import { AuthStore, UserStore } from '../../storage';

/**
 * Passkey Authentication Provider
 *
 * Implements AuthProvider interface for WebAuthn/Passkey authentication
 */
export class PasskeyAuthProvider implements AuthProvider {
  readonly type: AuthMethod = AuthMethod.PASSKEY;

  private passkeyService: PasskeyService;
  private currentUserDid: string | null = null;

  constructor() {
    this.passkeyService = new PasskeyService();
    this.currentUserDid = AuthStore.getCurrentUserDid();
  }

  /**
   * Check if Passkey authentication is supported
   */
  async isSupported(): Promise<boolean> {
    return await this.passkeyService.isSupported();
  }

  /**
   * Perform Passkey login/registration
   */
  async login(options?: LoginOptions): Promise<AuthResult> {
    try {
      let userDid: string;
      let isNewUser = false;

      // Check if we have existing credentials
      const hasCredentials = UserStore.hasAnyCredential();

      if (hasCredentials && options?.mediation === 'silent') {
        // Try silent login only
        userDid = await this.passkeyService.login({ mediation: 'silent' });
      } else if (hasCredentials) {
        // Regular login with required mediation
        userDid = await this.passkeyService.login({ mediation: 'required' });
      } else {
        // No credentials, create new user (only if not silent)
        if (options?.mediation === 'silent') {
          throw new Error('No credentials available for silent authentication');
        }
        userDid = await this.passkeyService.ensureUser();
        isNewUser = true;
      }

      // Update current state
      this.currentUserDid = userDid;
      AuthStore.setCurrentUserDid(userDid);

      // Note: Signer initialization removed - signing is done through Agent DIDs

      // Get auth identifier (first credential)
      const credentials = UserStore.listCredentials(userDid);
      const authIdentifier = credentials[0] || '';

      return {
        userDid,
        isNewUser,
        authMethod: AuthMethod.PASSKEY,
        authIdentifier,
      };
    } catch (error) {
      console.error('[PasskeyAuthProvider] Login failed:', error);
      throw error;
    }
  }

  /**
   * Perform logout
   */
  async logout(): Promise<void> {
    this.currentUserDid = null;
    AuthStore.clearCurrentUser();
  }

  /**
   * Get user identifier for a given User DID
   */
  getUserIdentifier(userDid: string): string | null {
    return UserStore.getAuthIdentifier(userDid);
  }

  /**
   * Get current user DID
   */
  getUserDid(): string | null {
    return this.currentUserDid;
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return !!this.currentUserDid;
  }

  /**
   * Restore authentication state (for app bootstrap)
   */
  async restoreSession(): Promise<boolean> {
    const currentUserDid = AuthStore.getCurrentUserDid();
    if (!currentUserDid) {
      return false;
    }

    try {
      // Verify the user still exists in storage
      const user = UserStore.getUser(currentUserDid);
      if (!user || user.authMethod !== AuthMethod.PASSKEY) {
        // User doesn't exist or is not a Passkey user
        AuthStore.clearCurrentUser();
        return false;
      }

      // Restore session state
      this.currentUserDid = currentUserDid;

      return true;
    } catch (error) {
      console.error('[PasskeyAuthProvider] Failed to restore session:', error);
      AuthStore.clearCurrentUser();
      return false;
    }
  }

  /**
   * Try silent authentication (for auto-login)
   * NOTE: Currently disabled because mediation: 'silent' often still shows prompts
   */
  async trySilentAuth(): Promise<AuthResult | null> {
    try {
      // Silent auth is disabled to prevent unwanted Passkey prompts
      console.debug('[PasskeyAuthProvider] Silent auth disabled - mediation: silent is unreliable');
      return null;

      // TODO: Implement true silent auth by checking session validity
      // without triggering WebAuthn calls
    } catch (error) {
      // Silent auth failed, this is expected
      console.debug('[PasskeyAuthProvider] Silent auth failed:', error);
      return null;
    }
  }
}
