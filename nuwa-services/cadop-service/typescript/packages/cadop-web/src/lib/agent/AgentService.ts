import { apiClient } from '../api/client';
import { PasskeyService } from '../passkey/PasskeyService';
import { custodianClient } from '../api/client';
import type { AgentDIDCreationStatus, ChallengeResponse } from '@cadop/shared';
import { UserStore } from '../storage';
import { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';

function decodeJWT(jwt: string): any | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJWT(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - now > 30; // 30-second leeway
}

export class AgentService {
  private passkeyService = new PasskeyService();

  public getCachedAgentDIDs(userDid: string): string[] {
    return UserStore.listAgents(userDid);
  }

  public async getIdToken(): Promise<string> {
    // We no longer cache idToken as per design doc
    // Always request a fresh token

    // ensure we have userDid
    const userDid = await this.passkeyService.ensureUser();

    // step 1: get challenge
    const challengeResp = await apiClient.get<ChallengeResponse>('/api/idp/challenge');
    if (!challengeResp.data)
      throw new Error(String(challengeResp.error || 'Failed to get challenge'));
    const { challenge, nonce } = challengeResp.data;
    const rpId = window.location.hostname;
    const origin = window.location.origin;
    try {
      // step 2: call PasskeyService.authenticateWithChallenge to authenticate
      const { assertionJSON, userDid: authenticatedDid } =
        await this.passkeyService.authenticateWithChallenge({
          challenge,
          rpId,
        });

      // step 3: send assertion to server to verify
      const verifyResp = await apiClient.post<{ idToken: string }>(
        '/api/idp/verify-assertion',
        { assertion: assertionJSON, userDid: authenticatedDid, nonce, rpId, origin },
        { skipAuth: true }
      );

      if (!verifyResp.data)
        throw new Error(String(verifyResp.error || 'Failed to verify assertion'));
      return verifyResp.data.idToken;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
      console.error('Passkey authentication failed error:', errorMessage);
      throw error;
    }
  }

  public async createAgent(): Promise<AgentDIDCreationStatus> {
    const idToken = await this.getIdToken();
    const userDid = await this.passkeyService.ensureUser();

    const resp = await custodianClient.mint({ idToken, userDid });
    if (!resp.data) throw new Error(String(resp.error || 'Mint failed'));

    if (resp.data.agentDid) {
      UserStore.addAgent(userDid, resp.data.agentDid);
    }
    return resp.data;
  }
}
