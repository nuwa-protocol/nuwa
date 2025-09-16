import { IAgentService } from './types';
import { AuthMethod } from '../storage/types';
import { UserStore, AuthStore } from '../storage';
import type { AgentDIDCreationStatus } from '@cadop/shared';
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { RoochWalletSigner } from '../auth/signers/RoochWalletSigner';

/**
 * Wallet Agent Service
 *
 * Handles Agent DID creation for wallet users via direct IdentityKit integration
 */
export class WalletAgentService implements IAgentService {
  readonly authMethod: AuthMethod = 'wallet';

  /**
   * Get cached Agent DIDs for a user
   */
  getCachedAgentDIDs(userDid: string): string[] {
    return UserStore.listAgents(userDid);
  }

  /**
   * Create a new Agent DID using IdentityKit directly
   */
  async createAgent(userDid: string, interactive = false): Promise<AgentDIDCreationStatus> {
    // Validate that this is a wallet user
    if (!this.canCreateAgent(userDid)) {
      throw new Error(`[WalletAgentService] Cannot create agent for non-wallet user: ${userDid}`);
    }

    try {
      // Get wallet address from User DID
      const walletAddress = UserStore.extractAddressFromDID(userDid);
      if (!walletAddress) {
        throw new Error(`[WalletAgentService] Invalid wallet DID format: ${userDid}`);
      }

      // Create wallet signer
      const signer = new RoochWalletSigner(userDid, walletAddress);

      // TODO: Ensure wallet is connected
      // This will depend on the wallet connection state management

      // Create Agent DID using IdentityKit
      const agentDid = await this.createAgentWithIdentityKit(signer);

      // Cache the created agent DID
      UserStore.addAgent(userDid, agentDid);

      return {
        agentDid,
        status: 'completed',
        // Add other required fields based on AgentDIDCreationStatus interface
      } as AgentDIDCreationStatus;
    } catch (error) {
      console.error('[WalletAgentService] Agent creation failed:', error);
      throw error;
    }
  }

  /**
   * Check if this service can create agents for the given user
   */
  canCreateAgent(userDid: string): boolean {
    const authMethod = UserStore.getAuthMethod(userDid);
    return authMethod === 'wallet';
  }

  /**
   * Create Agent DID using IdentityKit
   */
  private async createAgentWithIdentityKit(signer: RoochWalletSigner): Promise<string> {
    try {
      // Get public key from signer
      const publicKey = await signer.getPublicKey();

      // Create Agent DID creation request
      const creationRequest = {
        publicKey,
        // Add other required parameters for Agent creation
      };

      // Create new Agent DID (smart contract account on Rooch chain)
      const identityKit = await IdentityKit.createNewDID(
        'rooch', // DID method
        creationRequest,
        signer,
        {
          // Optional parameters for Agent creation
        }
      );

      // Get the created Agent DID
      const agentDid = identityKit.getDIDDocument().id;

      console.log('[WalletAgentService] Agent DID created:', agentDid);
      return agentDid;
    } catch (error) {
      console.error('[WalletAgentService] IdentityKit Agent creation failed:', error);
      throw error;
    }
  }

  /**
   * Validate wallet connection and signer availability
   */
  private async validateWalletConnection(signer: RoochWalletSigner): Promise<void> {
    if (!signer.isConnected()) {
      throw new Error('[WalletAgentService] Wallet not connected');
    }

    if (!(await signer.isAvailable())) {
      throw new Error('[WalletAgentService] Wallet signer not available');
    }
  }
}
