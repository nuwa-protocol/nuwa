import { createVDR, IdentityKit, VDRRegistry } from '@nuwa-ai/identity-kit';
import { ROOCH_RPC_URL } from '../../config/env';
import type {
  OperationalKeyInfo,
  VerificationRelationship,
  SignerInterface,
} from '@nuwa-ai/identity-kit';
import { SignerFactory } from '../auth/signers/SignerFactory';

export class DIDService {
  private identityKit: IdentityKit;
  private signer: SignerInterface;

  constructor(identityKit: IdentityKit, signer: SignerInterface) {
    this.identityKit = identityKit;
    this.signer = signer;
  }

  static async initialize(did: string, credentialId?: string): Promise<DIDService> {
    try {
      // Ensure VDR is registered
      const roochVDR = createVDR('rooch', {
        rpcUrl: ROOCH_RPC_URL,
        debug: true,
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);

      // Resolve DID document to check if it exists
      const didDocument = await VDRRegistry.getInstance().resolveDID(did);
      if (!didDocument) {
        throw new Error('Failed to resolve DID document');
      }

      console.log('[DIDService] Initializing with DID:', did, 'credentialId:', credentialId);

      // Use SignerFactory to create appropriate signer based on Agent DID
      const signerFactory = SignerFactory.getInstance();
      const signer = await signerFactory.createSignerFromAgentDID(did, {
        rpId: window.location.hostname,
        rpName: 'CADOP',
        credentialId: credentialId || undefined,
      });

      const identityKit = await IdentityKit.fromDIDDocument(didDocument, signer);
      return new DIDService(identityKit, signer);
    } catch (error) {
      console.error('[DIDService] Failed to initialize:', error);
      throw error;
    }
  }

  async addVerificationMethod(
    keyInfo: OperationalKeyInfo,
    relationships: VerificationRelationship[]
  ): Promise<string> {
    try {
      const keyId = await this.identityKit.addVerificationMethod(keyInfo, relationships);
      return keyId;
    } catch (error) {
      console.error('Failed to add verification method:', error);
      throw error;
    }
  }

  async removeVerificationMethod(keyId: string): Promise<boolean> {
    try {
      return await this.identityKit.removeVerificationMethod(keyId);
    } catch (error) {
      console.error('Failed to remove verification method:', error);
      throw error;
    }
  }

  async getDIDDocument(): Promise<any> {
    return this.identityKit.getDIDDocument();
  }

  getSigner(): SignerInterface {
    return this.signer;
  }
}
