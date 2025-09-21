import { IAgentService } from './types';
import { AuthMethod } from '../storage/types';
import { UserStore } from '../storage';
import type { AgentDIDCreationStatus } from '@cadop/shared';
import { IdentityKit, MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { VerificationRelationship } from '@nuwa-ai/identity-kit';
import type { Wallet } from '@roochnetwork/rooch-sdk-kit';
import { RoochWalletSigner } from '../auth/signers/RoochWalletSigner';

/**
 * Wallet Agent Service
 *
 * Handles Agent DID creation for wallet users via direct IdentityKit integration
 */
export class WalletAgentService implements IAgentService {
  readonly authMethod: AuthMethod = 'wallet';
  private currentWallet: Wallet | null = null;

  /**
   * Set current wallet instance (called by WalletStoreConnector)
   */
  setCurrentWallet(wallet: Wallet): void {
    this.currentWallet = wallet;
    console.log('[WalletAgentService] Current wallet set:', wallet.getName());
  }

  /**
   * Get current wallet instance
   */
  getCurrentWallet(): Wallet | null {
    return this.currentWallet;
  }

  /**
   * Get cached Agent DIDs for a user
   */
  getCachedAgentDIDs(userDid: string): string[] {
    return UserStore.listAgents(userDid);
  }

  /**
   * Create a new Agent DID using IdentityKit directly
   */
  async createAgent(userDid: string, _interactive = false): Promise<AgentDIDCreationStatus> {
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

      // Check if we have current wallet instance
      if (!this.currentWallet) {
        throw new Error('[WalletAgentService] No wallet connected. Please connect wallet first.');
      }

      // Create wallet signer and inject wallet instance
      const signer = new RoochWalletSigner(userDid, walletAddress);
      signer.setWallet(this.currentWallet);

      // Validate wallet connection
      await this.validateWalletConnection(signer);

      // Create Agent DID using IdentityKit
      const agentDid = await this.createAgentWithIdentityKit(signer);

      // Cache the created agent DID
      UserStore.addAgent(userDid, agentDid);

      const now = new Date();
      return {
        userDid,
        agentDid,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
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
      // Ensure VDR is initialized
      await this.ensureVDRInitialized();

      // Get public key from signer via IdentityKit interface
      const keyIds = await signer.listKeyIds();
      if (keyIds.length === 0) {
        throw new Error('[WalletAgentService] No keys available from signer');
      }

      const keyInfo = await signer.getKeyInfo(keyIds[0]);
      if (!keyInfo) {
        throw new Error('[WalletAgentService] Failed to get key info from signer');
      }
      const publicKey = keyInfo.publicKey;

      // Encode public key as multibase
      const publicKeyMultibase = await MultibaseCodec.encodeBase58btc(publicKey);

      // Create Agent DID creation request
      const creationRequest = {
        publicKeyMultibase,
        keyType: 'EcdsaSecp256k1VerificationKey2019', // Bitcoin/Secp256k1 key type
        initialRelationships: [
          'authentication',
          'assertionMethod',
          'capabilityInvocation',
          'capabilityDelegation',
        ] as VerificationRelationship[],
        customScopes: ['0x3::*::*'], // Allow all scopes for Agent
      };

      console.log('[WalletAgentService] Creating Agent DID with request:', creationRequest);

      // Create new Agent DID (smart contract account on Rooch chain)
      const identityKit = await IdentityKit.createNewDID(
        'rooch', // DID method
        creationRequest,
        signer,
        {
          // Pass signer in options for RoochVDR
          signer: signer,
          // Optional parameters for Agent creation
          network: import.meta.env.VITE_ROOCH_NETWORK || 'devnet',
        }
      );

      // Get the created Agent DID
      const agentDid = identityKit.getDIDDocument().id;

      console.log('[WalletAgentService] Agent DID created successfully:', agentDid);
      return agentDid;
    } catch (error) {
      console.error('[WalletAgentService] IdentityKit Agent creation failed:', error);
      throw error;
    }
  }

  /**
   * Ensure VDR is initialized for identity operations using centralized VDRManager
   */
  private async ensureVDRInitialized(): Promise<void> {
    const { ensureVDRInitialized } = await import('../identity/VDRManager');
    await ensureVDRInitialized();
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
