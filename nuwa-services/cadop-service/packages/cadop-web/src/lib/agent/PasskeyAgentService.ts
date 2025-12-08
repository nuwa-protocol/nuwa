import { IAgentService } from './types';
import { AuthMethod } from '../storage/types';
import { apiClient } from '../api/client';
import { PasskeyService } from '../passkey/PasskeyService';
import { custodianClient } from '../api/client';
import type { AgentDIDCreationStatus, ChallengeResponse } from '@cadop/shared';
import { UserStore, AuthStore } from '../storage';

/**
 * Passkey Agent Service
 *
 * Handles Agent DID creation for Passkey users via CADOP API
 */
export class PasskeyAgentService implements IAgentService {
  readonly authMethod: AuthMethod = AuthMethod.PASSKEY;

  private passkeyService = new PasskeyService();

  /**
   * Get cached Agent DIDs for a user
   */
  getCachedAgentDIDs(userDid: string): string[] {
    return UserStore.listAgents(userDid);
  }

  /**
   * Create a new Agent DID via CADOP API
   */
  async createAgent(userDid: string, interactive = false): Promise<AgentDIDCreationStatus> {
    // Validate that this is a Passkey user
    if (!this.canCreateAgent(userDid)) {
      throw new Error(`[PasskeyAgentService] Cannot create agent for non-Passkey user: ${userDid}`);
    }

    try {
      // Get ID token for authentication
      const idToken = await this.getIdToken(userDid, interactive);

      // Create agent via CADOP API
      const resp = await custodianClient.mint({ idToken, userDid });
      if (!resp.data) {
        throw new Error(String(resp.error || 'Agent creation failed'));
      }

      // Cache the created agent DID
      if (resp.data.agentDid) {
        UserStore.addAgent(userDid, resp.data.agentDid);
      }

      return resp.data;
    } catch (error) {
      console.error('[PasskeyAgentService] Agent creation failed:', error);
      throw error;
    }
  }

  /**
   * Check if this service can create agents for the given user
   */
  canCreateAgent(userDid: string): boolean {
    const authMethod = UserStore.getAuthMethod(userDid);
    return authMethod === AuthMethod.PASSKEY;
  }

  /**
   * Get ID token for CADOP API authentication
   */
  async getIdToken(userDid: string, interactive = false): Promise<string> {
    // Ensure the user is currently authenticated
    const currentUserDid = AuthStore.getCurrentUserDid();
    if (currentUserDid !== userDid) {
      throw new Error('[PasskeyAgentService] User not currently authenticated');
    }

    try {
      // Step 1: Get challenge from CADOP API
      const challengeResp = await apiClient.get<ChallengeResponse>('/api/idp/challenge');
      if (!challengeResp.data) {
        throw new Error(String(challengeResp.error || 'Failed to get challenge'));
      }

      const { challenge, nonce } = challengeResp.data;
      const rpId = window.location.hostname;
      const origin = window.location.origin;

      // Step 2: Authenticate with Passkey
      const { assertionJSON, userDid: authenticatedDid } =
        await this.passkeyService.authenticateWithChallenge({
          challenge,
          rpId,
          mediation: interactive ? 'required' : 'silent',
        });

      // Verify the authenticated DID matches
      if (authenticatedDid !== userDid) {
        throw new Error('[PasskeyAgentService] Authenticated DID does not match requested DID');
      }

      // Step 3: Verify assertion and get ID token
      const verifyResp = await apiClient.post<{ idToken: string }>(
        '/api/idp/verify-assertion',
        { assertion: assertionJSON, userDid: authenticatedDid, nonce, rpId, origin },
        { skipAuth: true }
      );

      if (!verifyResp.data) {
        throw new Error(String(verifyResp.error || 'Failed to verify assertion'));
      }

      return verifyResp.data.idToken;
    } catch (error) {
      console.error('[PasskeyAgentService] ID token generation failed:', error);
      throw error;
    }
  }
}
