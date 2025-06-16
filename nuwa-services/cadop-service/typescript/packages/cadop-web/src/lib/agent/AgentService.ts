import { apiClient } from '../api/client';
import { PasskeyService } from '../passkey/PasskeyService';
import { custodianClient } from '../api/client';
import type { AgentDIDCreationStatus } from '@cadop/shared';
import { UserStore } from '../storage';

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

    // step 1: get nonce
    const challengeResp = await apiClient.get<{ nonce: string; rpId: string }>('/api/idp/challenge');
    if (!challengeResp.data) throw new Error(String(challengeResp.error || 'Failed to get challenge'));
    const { nonce } = challengeResp.data;

    // step 2: (simplified) directly verify without assertion
    const verifyResp = await apiClient.post<{ idToken: string }>(
      '/api/idp/verify',
      { nonce, userDid },
      { skipAuth: true }
    );
    if (!verifyResp.data) throw new Error(String(verifyResp.error || 'Failed to get idToken'));

    return verifyResp.data.idToken;
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