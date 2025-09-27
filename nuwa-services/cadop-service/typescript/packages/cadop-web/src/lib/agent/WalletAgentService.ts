import { IAgentService } from './types';
import { AuthMethod } from '../storage/types';
import { UserStore } from '../storage';
import type { AgentDIDCreationStatus } from '@cadop/shared';
import type { Wallet } from '@roochnetwork/rooch-sdk-kit';
import { RoochWalletSigner } from '../auth/signers/RoochWalletSigner';
import { BitcoinIdTokenService } from '../auth/BitcoinIdTokenService';
import { custodianClient } from '../api/client';

/**
 * Wallet Agent Service
 *
 * Handles Agent DID creation for wallet users via cadop-api
 */
export class WalletAgentService implements IAgentService {
  readonly authMethod: AuthMethod = AuthMethod.WALLET;
  private currentWallet: Wallet | null = null;
  private bitcoinIdTokenService: BitcoinIdTokenService;

  constructor() {
    this.bitcoinIdTokenService = new BitcoinIdTokenService();
  }

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
   * Create a new Agent DID via cadop-api
   */
  async createAgent(userDid: string, _interactive = false): Promise<AgentDIDCreationStatus> {
    // Validate that this is a wallet user
    if (!this.canCreateAgent(userDid)) {
      throw new Error(`[WalletAgentService] Cannot create agent for non-wallet user: ${userDid}`);
    }

    try {
      console.log(
        '[WalletAgentService] Creating Agent DID via cadop-api for wallet user:',
        userDid
      );

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

      // Generate ID token using Bitcoin wallet signature
      const idToken = await this.bitcoinIdTokenService.generateIdToken(signer);

      // Create agent via cadop-api
      const response = await custodianClient.mint({ idToken, userDid });
      if (!response.data) {
        throw new Error(String(response.error || 'Agent creation failed'));
      }

      // Cache the created agent DID
      if (response.data.agentDid) {
        UserStore.addAgent(userDid, response.data.agentDid);
        console.log('[WalletAgentService] Agent DID created and cached:', response.data.agentDid);
      }

      return response.data;
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
    return authMethod === AuthMethod.WALLET;
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
