import { VDRRegistry, createVDR, VDRInterface } from './vdr';
import { KeyManager } from './keys/KeyManager';
import { MemoryKeyStore, KeyStore } from './keys/KeyStore';
import { IdentityKit } from './IdentityKit';
import { DIDDocument } from './types/did';
import { SignerInterface } from './signers/types';
import { DIDCreationRequest } from './vdr/types';
import { getDidWithoutFragment } from './utils/did';

/**
 * IdentityEnv – runtime environment prepared by the Builder/bootstrap.
 * It wires together VDRRegistry + KeyManager, but **does not** automatically create a DID.
 */
export class IdentityEnv {
  constructor(public registry: VDRRegistry, public keyManager: KeyManager) {}

  /**
   * Load an existing DID and return a ready IdentityKit instance
   */
  async loadDid(did: string, signer?: SignerInterface): Promise<IdentityKit> {
    const s = signer || this.keyManager;
    if (!signer) {
      // Ensure keyManager knows DID (it may be needed for key generation later)
      try {
        this.keyManager.setDid(did);
      } catch (_) {
        /* ignore */
      }
    }
    return IdentityKit.fromExistingDID(did, s);
  }

  /**
   * Load from a known DID Document
   */
  async fromDocument(doc: DIDDocument, signer?: SignerInterface): Promise<IdentityKit> {
    const s = signer || this.keyManager;
    if (!signer) {
      this.keyManager.setDid(getDidWithoutFragment(doc.id));
    }
    return IdentityKit.fromDIDDocument(doc, s);
  }

  /**
   * Create a new DID via the underlying VDR
   */
  async createDid(
    method: string,
    request: DIDCreationRequest,
    signer?: SignerInterface,
    options?: Record<string, any>
  ): Promise<IdentityKit> {
    const s = signer || this.keyManager;
    return IdentityKit.createNewDID(method, request, s, options);
  }
}

/**
 * Builder for configuring IdentityEnv step-by-step
 */
export class IdentityEnvBuilder {
  private vdrConfigs: { method: string; options?: any }[] = [];
  private keyStore?: KeyStore;
  private keyManager?: KeyManager;

  /** Register (or ensure) a VDR for given DID method */
  useVDR(method: string, options?: any): this {
    this.vdrConfigs.push({ method, options });
    return this;
  }

  /** Provide a custom KeyStore implementation */
  useKeyStore(store: KeyStore): this {
    this.keyStore = store;
    return this;
  }

  /** Provide a pre-built KeyManager (advanced) */
  useKeyManager(manager: KeyManager): this {
    this.keyManager = manager;
    return this;
  }

  /** Finalise and return the environment */
  async init(): Promise<IdentityEnv> {
    const registry = VDRRegistry.getInstance();

    // 1. Ensure requested VDRs are registered
    for (const { method, options } of this.vdrConfigs) {
      if (!registry.getVDR(method)) {
        const vdr = createVDR(method, options);
        registry.registerVDR(vdr as VDRInterface);
      }
    }

    // 2. Prepare KeyManager
    let km: KeyManager;
    if (this.keyManager) {
      km = this.keyManager;
    } else {
      const store = this.keyStore || new MemoryKeyStore();
      km = new KeyManager({ store });
    }

    return new IdentityEnv(registry, km);
  }
}

/** Convenience helper similar to the old `init()` but **without** auto-creating DID */
export async function bootstrapIdentityEnv(opts: {
  method?: string;
  keyStore?: KeyStore;
  vdrOptions?: any;
} = {}): Promise<IdentityEnv> {
  const builder = new IdentityEnvBuilder();
  const method = opts.method || 'rooch';
  builder.useVDR(method, opts.vdrOptions);
  if (opts.keyStore) builder.useKeyStore(opts.keyStore);
  return builder.init();
} 