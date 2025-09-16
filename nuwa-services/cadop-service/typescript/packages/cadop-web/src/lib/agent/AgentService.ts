import { unifiedAgentService } from './UnifiedAgentService';
import { PasskeyAgentService } from './PasskeyAgentService';
import { WalletAgentService } from './WalletAgentService';
import { AuthStore } from '../storage';
import type { AgentDIDCreationStatus } from '@cadop/shared';

// Initialize the unified agent service with available implementations
const passkeyAgentService = new PasskeyAgentService();
const walletAgentService = new WalletAgentService();
unifiedAgentService.registerAgentService('passkey', passkeyAgentService);
unifiedAgentService.registerAgentService('wallet', walletAgentService);

/**
 * Legacy AgentService for backward compatibility
 *
 * @deprecated Use UnifiedAgentService directly for new code
 */
export class AgentService {
  /**
   * Get cached Agent DIDs for current user
   */
  public getCachedAgentDIDs(userDid: string): string[] {
    return unifiedAgentService.getCachedAgentDIDs(userDid);
  }

  /**
   * Get ID token for current user (Passkey only)
   *
   * @deprecated This method is specific to Passkey authentication
   */
  public async getIdToken(interactive = false): Promise<string> {
    const userDid = AuthStore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('User did not exist');
    }

    // This only works for Passkey users
    const agentService = unifiedAgentService.getAgentService(userDid);
    if (agentService.authMethod !== 'passkey') {
      throw new Error('getIdToken is only supported for Passkey users');
    }

    // Cast to PasskeyAgentService to access getIdToken method
    const passkeyService = agentService as PasskeyAgentService;
    return await passkeyService.getIdToken(userDid, interactive);
  }

  /**
   * Create agent for current user
   */
  public async createAgent(interactive = false): Promise<AgentDIDCreationStatus> {
    const userDid = AuthStore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('User did not exist');
    }

    return await unifiedAgentService.createAgent(userDid, interactive);
  }
}

// Export the unified service for new code
export { unifiedAgentService };
