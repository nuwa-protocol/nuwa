import type { SignerInterface, DIDDocument } from '@nuwa-ai/identity-kit';
import { AuthMethod } from '../../storage/types';
import { UserStore } from '../../storage';
import { WebAuthnSigner } from '../WebAuthnSigner';
import { RoochWalletSigner } from './RoochWalletSigner';
import { VDRRegistry, createVDR } from '@nuwa-ai/identity-kit';
import { unifiedAgentService } from '../../agent/UnifiedAgentService';
import { WalletAgentService } from '../../agent/WalletAgentService';

const ROOCH_RPC_URL = import.meta.env.VITE_ROOCH_RPC_URL || 'https://dev-seed.rooch.network:443';

/**
 * Signer creation options
 */
export interface SignerOptions {
  /** User DID */
  userDid: string;
  /** Authentication method */
  authMethod: AuthMethod;
  /** Additional signer-specific options */
  [key: string]: any;
}

/**
 * Signer factory for creating appropriate signer instances
 */
export class SignerFactory {
  private static instance: SignerFactory;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): SignerFactory {
    if (!SignerFactory.instance) {
      SignerFactory.instance = new SignerFactory();
    }
    return SignerFactory.instance;
  }

  /**
   * Create signer for the given user DID and authentication method
   */
  async createSigner(options: SignerOptions): Promise<SignerInterface> {
    const { userDid, authMethod } = options;

    switch (authMethod) {
      case 'passkey':
        return await this.createWebAuthnSigner(userDid, options);
      case 'wallet':
        return await this.createWalletSigner(userDid, options);
      default:
        throw new Error(`[SignerFactory] Unsupported authentication method: ${authMethod}`);
    }
  }

  /**
   * Create signer from user DID (auto-detect auth method)
   */
  async createSignerFromDID(
    userDid: string,
    additionalOptions?: Record<string, any>
  ): Promise<SignerInterface> {
    const authMethod = UserStore.getAuthMethod(userDid);
    if (!authMethod) {
      throw new Error(`[SignerFactory] Cannot determine auth method for DID: ${userDid}`);
    }

    return await this.createSigner({
      userDid,
      authMethod,
      ...additionalOptions,
    });
  }

  /**
   * Create signer from Agent DID (detects creator's auth method)
   */
  async createSignerFromAgentDID(
    agentDid: string,
    additionalOptions?: Record<string, any>
  ): Promise<SignerInterface> {
    try {
      // Ensure VDR is registered
      await this.ensureVDRRegistered();

      // Resolve Agent DID document
      const didDocument = await VDRRegistry.getInstance().resolveDID(agentDid);
      if (!didDocument) {
        throw new Error(`Failed to resolve Agent DID document: ${agentDid}`);
      }

      // Extract controller (creator's User DID) from Agent DID document
      if (!didDocument.controller || didDocument.controller.length === 0) {
        throw new Error(`No controller found in Agent DID document: ${agentDid}`);
      }

      const controllerDid = didDocument.controller[0];

      // Determine auth method from controller DID
      let authMethod: AuthMethod;
      if (controllerDid.startsWith('did:key:')) {
        authMethod = 'passkey';
      } else if (
        controllerDid.startsWith('did:bitcoin:') ||
        controllerDid.startsWith('did:rooch:')
      ) {
        authMethod = 'wallet';
      } else {
        throw new Error(`Unsupported controller DID format: ${controllerDid}`);
      }

      // Create appropriate signer with Agent DID document
      if (authMethod === 'passkey') {
        return this.createWebAuthnSignerForAgent(controllerDid, didDocument, additionalOptions);
      } else {
        // Extract wallet address from controller DID
        const walletAddress = UserStore.extractAddressFromDID(controllerDid);
        if (!walletAddress) {
          throw new Error(`Invalid wallet DID format: ${controllerDid}`);
        }

        return this.createWalletSignerForAgent(
          controllerDid,
          walletAddress,
          didDocument,
          additionalOptions
        );
      }
    } catch (error) {
      console.error('[SignerFactory] Failed to create signer from Agent DID:', error);
      throw error;
    }
  }

  /**
   * Create WebAuthn signer for Passkey users
   */
  private async createWebAuthnSigner(
    userDid: string,
    options: SignerOptions
  ): Promise<WebAuthnSigner> {
    try {
      // Ensure VDR is registered
      await this.ensureVDRRegistered();

      // Resolve DID document
      const didDocument = await VDRRegistry.getInstance().resolveDID(userDid);
      if (!didDocument) {
        throw new Error(`Failed to resolve DID document for: ${userDid}`);
      }

      // Get credential ID for this user
      const credentials = UserStore.listCredentials(userDid);
      const credentialId = credentials[0]; // Use first credential

      // Create WebAuthn signer
      const signer = new WebAuthnSigner(userDid, {
        didDocument: didDocument,
        rpId: options.rpId || window.location.hostname,
        rpName: options.rpName || 'CADOP',
        credentialId: credentialId || undefined,
      });

      return signer;
    } catch (error) {
      console.error('[SignerFactory] Failed to create WebAuthn signer:', error);
      throw error;
    }
  }

  /**
   * Create wallet signer for wallet users
   */
  private async createWalletSigner(
    userDid: string,
    _options: SignerOptions
  ): Promise<RoochWalletSigner> {
    try {
      // Extract wallet address from User DID
      const walletAddress = UserStore.extractAddressFromDID(userDid);
      if (!walletAddress) {
        throw new Error(`Invalid wallet DID format: ${userDid}`);
      }

      // Create wallet signer
      const signer = new RoochWalletSigner(userDid, walletAddress);

      return signer;
    } catch (error) {
      console.error('[SignerFactory] Failed to create wallet signer:', error);
      throw error;
    }
  }

  /**
   * Create WebAuthn signer for Agent DID operations
   */
  private async createWebAuthnSignerForAgent(
    controllerDid: string,
    didDocument: DIDDocument,
    additionalOptions?: Record<string, any>
  ): Promise<WebAuthnSigner> {
    try {
      // Get credential ID for this user
      const credentials = UserStore.listCredentials(controllerDid);
      const credentialId = credentials[0]; // Use first credential

      // Create WebAuthn signer with Agent DID document
      const signer = new WebAuthnSigner(didDocument.id, {
        didDocument: didDocument,
        rpId: additionalOptions?.rpId || window.location.hostname,
        rpName: additionalOptions?.rpName || 'CADOP',
        credentialId: credentialId || undefined,
      });

      return signer;
    } catch (error) {
      console.error('[SignerFactory] Failed to create WebAuthn signer for Agent:', error);
      throw error;
    }
  }

  /**
   * Create wallet signer for Agent DID operations
   */
  private async createWalletSignerForAgent(
    controllerDid: string,
    walletAddress: string,
    didDocument: DIDDocument,
    _additionalOptions?: Record<string, any>
  ): Promise<RoochWalletSigner> {
    try {
      // Create wallet signer with Agent DID document
      const signer = new RoochWalletSigner(controllerDid, walletAddress, {
        didDocument: didDocument,
      });

      // Get current wallet instance from WalletAgentService
      const walletAgentService = unifiedAgentService.getAgentServiceByMethod('wallet');
      if (walletAgentService instanceof WalletAgentService) {
        const currentWallet = walletAgentService.getCurrentWallet();
        if (currentWallet) {
          signer.setWallet(currentWallet);
          console.log('[SignerFactory] Injected wallet into RoochWalletSigner for Agent DID');
        } else {
          console.warn('[SignerFactory] No current wallet available in WalletAgentService');
        }
      } else {
        console.warn('[SignerFactory] WalletAgentService not found');
      }

      return signer;
    } catch (error) {
      console.error('[SignerFactory] Failed to create wallet signer for Agent:', error);
      throw error;
    }
  }

  /**
   * Ensure Rooch VDR is registered
   */
  private async ensureVDRRegistered(): Promise<void> {
    if (!VDRRegistry.getInstance().getVDR('rooch')) {
      const roochVDR = createVDR('rooch', {
        rpcUrl: ROOCH_RPC_URL,
        debug: true,
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);
    }
  }

  /**
   * Check if signer can be created for the given DID
   */
  async canCreateSigner(userDid: string): Promise<boolean> {
    try {
      const authMethod = UserStore.getAuthMethod(userDid);
      if (!authMethod) {
        return false;
      }

      // Check if user exists in storage
      const user = UserStore.getUser(userDid);
      if (!user) {
        return false;
      }

      // Additional checks based on auth method
      switch (authMethod) {
        case 'passkey':
          // Check if user has credentials
          return user.credentials.length > 0;
        case 'wallet':
          // Wallet users should have valid DID format
          return userDid.startsWith('did:rooch:');
        default:
          return false;
      }
    } catch (error) {
      console.error('[SignerFactory] Error checking signer availability:', error);
      return false;
    }
  }

  /**
   * Get supported authentication methods
   */
  getSupportedAuthMethods(): AuthMethod[] {
    return ['passkey', 'wallet'];
  }
}
