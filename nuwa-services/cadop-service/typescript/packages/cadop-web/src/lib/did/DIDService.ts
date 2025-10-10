import { IdentityKit, VDRRegistry } from '@nuwa-ai/identity-kit';
import type { ServiceInfo } from '@nuwa-ai/identity-kit';
import { ensureVDRInitialized } from '../identity/VDRManager';
import type {
  OperationalKeyInfo,
  VerificationRelationship,
  SignerInterface,
} from '@nuwa-ai/identity-kit';
import { SignerFactory } from '../auth/signers/SignerFactory';

export class DIDService {
  private identityKit: IdentityKit;
  private signer: SignerInterface;
  private did: string;

  constructor(identityKit: IdentityKit, signer: SignerInterface, did: string) {
    this.identityKit = identityKit;
    this.signer = signer;
    this.did = did;
  }

  static async initialize(did: string, credentialId?: string): Promise<DIDService> {
    try {
      // Ensure VDRs are initialized using centralized VDRManager
      await ensureVDRInitialized();

      // Resolve DID document to check if it exists
      const didDocument = await VDRRegistry.getInstance().resolveDID(did);
      if (!didDocument) {
        throw new Error('Failed to resolve DID document');
      }

      console.debug('[DIDService] Initializing with DID:', did, 'credentialId:', credentialId);

      // Use SignerFactory to create appropriate signer based on Agent DID
      const signerFactory = SignerFactory.getInstance();
      const signer = await signerFactory.createSignerFromAgentDID(did, {
        rpId: window.location.hostname,
        rpName: 'CADOP',
        credentialId: credentialId || undefined,
      });

      const identityKit = await IdentityKit.fromDIDDocument(didDocument, signer);
      return new DIDService(identityKit, signer, did);
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

  async getDIDDocument(forceRefresh?: boolean): Promise<unknown> {
    if (forceRefresh) {
      return VDRRegistry.getInstance().resolveDID(this.did, { forceRefresh: true });
    }
    return this.identityKit.getDIDDocument();
  }

  getSigner(): SignerInterface {
    return this.signer;
  }

  async addService(serviceInfo: ServiceInfo): Promise<void> {
    try {
      await this.identityKit.addService(serviceInfo);
    } catch (error) {
      console.error('[DIDService] Failed to add service:', error);
      throw error;
    }
  }

  async removeService(serviceId: string): Promise<void> {
    try {
      await this.identityKit.removeService(serviceId);
    } catch (error) {
      console.error('[DIDService] Failed to remove service:', error);
      throw error;
    }
  }
}
