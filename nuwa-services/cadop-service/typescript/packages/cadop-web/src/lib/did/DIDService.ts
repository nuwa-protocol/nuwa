import { createVDR, NuwaIdentityKit, VDRRegistry } from 'nuwa-identity-kit';
import type { OperationalKeyInfo, VerificationRelationship, SignerInterface, VDRInterface } from 'nuwa-identity-kit';
import { WebAuthnSigner } from '../auth/WebAuthnSigner';
import { Session } from '@cadop/shared';

export class DIDService {
  private identityKit: NuwaIdentityKit;

  constructor(identityKit: NuwaIdentityKit) {
    this.identityKit = identityKit;
  }

  static async initialize(did: string, session: Session): Promise<DIDService> {
    try {
        const roochVDR = createVDR('rooch', {
            rpcUrl: import.meta.env.VITE_ROOCH_RPC_URL,
            debug: true
        });
        VDRRegistry.getInstance().registerVDR(roochVDR);
        const didDocument = await VDRRegistry.getInstance().resolveDID(did);
        if (!didDocument) {
            throw new Error('Failed to resolve DID document');
        }
        const signer = new WebAuthnSigner(did, {
            didDocument: didDocument,
            rpId: window.location.hostname,
            rpName: 'CADOP',
            credentialId: session.credentialId
        });

        const identityKit = await NuwaIdentityKit.fromDIDDocument(
            didDocument,
            signer
        );
        return new DIDService(identityKit);
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
} 