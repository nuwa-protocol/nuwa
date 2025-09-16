import { IUnifiedAgentService, IAgentService } from './types';
import { AuthMethod } from '../storage/types';
import { UserStore } from '../storage';
import type { AgentDIDCreationStatus } from '@cadop/shared';

/**
 * Unified Agent Service
 *
 * Manages Agent creation across different authentication methods
 */
export class UnifiedAgentService implements IUnifiedAgentService {
  private agentServices = new Map<AuthMethod, IAgentService>();

  /**
   * Register an agent service for an authentication method
   */
  registerAgentService(authMethod: AuthMethod, service: IAgentService): void {
    this.agentServices.set(authMethod, service);
  }

  /**
   * Get agent service by auth method (without requiring userDid)
   */
  getAgentServiceByMethod(authMethod: AuthMethod): IAgentService | undefined {
    return this.agentServices.get(authMethod);
  }

  /**
   * Get cached Agent DIDs for a user
   */
  getCachedAgentDIDs(userDid: string): string[] {
    return UserStore.listAgents(userDid);
  }

  /**
   * Create a new Agent DID (auto-detects auth method)
   */
  async createAgent(userDid: string, interactive = false): Promise<AgentDIDCreationStatus> {
    const agentService = this.getAgentService(userDid);
    return await agentService.createAgent(userDid, interactive);
  }

  /**
   * Get appropriate agent service for a user
   */
  getAgentService(userDid: string): IAgentService {
    const authMethod = UserStore.getAuthMethod(userDid);
    if (!authMethod) {
      throw new Error(`[UnifiedAgentService] Cannot determine auth method for user: ${userDid}`);
    }

    const service = this.agentServices.get(authMethod);
    if (!service) {
      throw new Error(
        `[UnifiedAgentService] No agent service registered for auth method: ${authMethod}`
      );
    }

    if (!service.canCreateAgent(userDid)) {
      throw new Error(
        `[UnifiedAgentService] Agent service cannot create agent for user: ${userDid}`
      );
    }

    return service;
  }

  /**
   * Check if agent creation is supported for a user
   */
  canCreateAgent(userDid: string): boolean {
    try {
      const agentService = this.getAgentService(userDid);
      return agentService.canCreateAgent(userDid);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all registered authentication methods
   */
  getSupportedAuthMethods(): AuthMethod[] {
    return Array.from(this.agentServices.keys());
  }
}

/**
 * Global unified agent service instance
 */
export const unifiedAgentService = new UnifiedAgentService();
