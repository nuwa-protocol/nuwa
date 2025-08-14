import { createVDR, IdentityKit, VDRRegistry } from '@nuwa-ai/identity-kit';
import { ROOCH_RPC_URL } from '../../config/env';
import type {
  OperationalKeyInfo,
  VerificationRelationship,
  SignerInterface,
} from '@nuwa-ai/identity-kit';
import { WebAuthnSigner } from '../auth/WebAuthnSigner';

export class DIDService {
  private identityKit: IdentityKit;
  private signer: SignerInterface;

  constructor(identityKit: IdentityKit, signer: SignerInterface) {
    this.identityKit = identityKit;
    this.signer = signer;
  }

  static async initialize(did: string, credentialId?: string): Promise<DIDService> {
    try {
      const roochVDR = createVDR('rooch', {
        rpcUrl: ROOCH_RPC_URL,
        debug: true,
      });
      VDRRegistry.getInstance().registerVDR(roochVDR);
      const didDocument = await VDRRegistry.getInstance().resolveDID(did);
      if (!didDocument) {
        throw new Error('Failed to resolve DID document');
      }
      console.log('initialize with credentialId', credentialId);
      const signer = new WebAuthnSigner(did, {
        didDocument: didDocument,
        rpId: window.location.hostname,
        rpName: 'CADOP',
        credentialId: credentialId || undefined,
      });

      const identityKit = await IdentityKit.fromDIDDocument(didDocument, signer);
      return new DIDService(identityKit, signer);
    } catch (error) {
      console.error('Failed to initialize DID service:', error);
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
