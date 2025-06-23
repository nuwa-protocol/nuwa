import {
  KeyManager,
  NIP1SignedObject,
  DIDAuth,
  VDRRegistry,
  SignedData,
  IdentityKit,
} from '@nuwa-ai/identity-kit';
import { LocalStorageKeyStore } from './keystore/LocalStorageKeyStore';
import { IndexedDBKeyStore } from './keystore/IndexedDBKeyStore';
import { DeepLinkManager } from './deeplink/DeepLinkManager';

export interface IdentityKitWebOptions {
  /** Application name, used to build key id fragment; optional */
  appName?: string;
  cadopDomain?: string;
  storage?: 'local' | 'indexeddb' | 'memory';
  keyManager?: KeyManager;
  deepLinkManager?: DeepLinkManager;
  /** Optional explicit RPC endpoint for Rooch node */
  roochRpcUrl?: string;
}

/**
 * IdentityKitWeb – High-level Web SDK for Nuwa Identity Kit
 * Provides a high-level API for web applications
 */
export class IdentityKitWeb {
  private keyManager: KeyManager;
  private deepLinkManager: DeepLinkManager;
  private cadopDomain: string;
  private appName?: string;

  private constructor(
    keyManager: KeyManager,
    deepLinkManager: DeepLinkManager,
    cadopDomain: string,
    appName?: string
  ) {
    this.keyManager = keyManager;
    this.deepLinkManager = deepLinkManager;
    this.cadopDomain = cadopDomain;
    this.appName = appName;
  }

  /**
   * Initialize the IdentityKitWeb
   */
  static async init(options: IdentityKitWebOptions = {}): Promise<IdentityKitWeb> {
    const { appName } = options;
    const cadopDomain = options.cadopDomain || 'https://test-id.nuwa.dev';

    // Resolve Rooch network and RPC URL
    const network = resolveNetworkFromHost(cadopDomain);
    const rpcUrl =
      options.roochRpcUrl ||
      (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ROOCH_RPC_URL : undefined);

    // Determine KeyStore based on storage preference (defaults to LocalStorage)
    let keyStore: any | undefined;
    switch (options.storage) {
      case 'indexeddb':
        keyStore = new IndexedDBKeyStore();
        break;
      case 'memory':
        keyStore = undefined; // let IdentityKit create an in-memory store
        break;
      case 'local':
      default:
        keyStore = new LocalStorageKeyStore();
        break;
    }

    // Bootstrap IdentityEnv which internally registers VDRs and prepares KeyManager
    const env = await IdentityKit.bootstrap({
      method: 'rooch',
      keyStore,
      vdrOptions: { network, rpcUrl },
    });

    // Use provided KeyManager if specified, otherwise take from env
    const keyManager = options.keyManager || env.keyManager;

    // Create or use provided DeepLinkManager
    const deepLinkManager =
      options.deepLinkManager ||
      new DeepLinkManager({
        keyManager,
      });

    return new IdentityKitWeb(keyManager, deepLinkManager, cadopDomain, appName);
  }

  /**
   * Check if the user is connected
   */
  async isConnected(): Promise<boolean> {
    const keyIds = await this.keyManager.listKeyIds();
    return keyIds.length > 0;
  }

  /**
   * Get the current DID
   */
  async getDid(): Promise<string> {
    return await this.keyManager.getDid();
  }

  /**
   * List all key IDs
   */
  async listKeyIds(): Promise<string[]> {
    return this.keyManager.listKeyIds();
  }

  /**
   * Connect to Cadop
   * This will open a new window with the Cadop add-key page
   */
  async connect(): Promise<void> {
    const idFragment = this.generateIdFragment();

    const { url } = await this.deepLinkManager.buildAddKeyUrl({
      cadopDomain: this.cadopDomain,
      idFragment,
    });
    
    // Open the URL in a new window/tab
    window.open(url, '_blank');
  }

  /**
   * Handle the callback from Cadop
   */
  async handleCallback(search: string): Promise<void> {
    const result = await this.deepLinkManager.handleCallback(search);
    if (!result.success) {
      throw new Error(result.error || 'Unknown error during callback');
    }
  }

  /**
   * Sign an operation payload using DIDAuth v1
   * @param payload Object containing `operation` and `params` fields (other fields will be added automatically)
   */
  async sign(payload: Omit<SignedData, 'nonce' | 'timestamp'>): Promise<NIP1SignedObject> {
    const keyIds = await this.keyManager.listKeyIds();
    if (keyIds.length === 0) {
      throw new Error('No keys available for signing');
    }

    const keyId = keyIds[0];

    // Delegate signature creation to core DIDAuth util
    return DIDAuth.v1.createSignature(payload, this.keyManager, keyId);
  }

  /**
   * Verify a signature
   */
  async verify(sig: NIP1SignedObject, opts?: { maxClockSkew?: number }): Promise<boolean> {
    const registry = VDRRegistry.getInstance();
    return DIDAuth.v1.verifySignature(sig, registry, opts);
  }

  /**
   * Logout (clear all keys)
   */
  async logout(): Promise<void> {
    const store = this.keyManager['store']; // Accessing private field
    if (store) {
      await store.clear();
    }
  }

  /**
   * Generate a readable idFragment based on the application name.
   * 1. Slugify the provided appName (keep a-z, 0-9, _ and -)
   * 2. If slug becomes empty (e.g. non-Latin name), fall back to current hostname
   * 3. If hostname slug is still empty (edge case), use default 'key'
   * Always append timestamp to ensure uniqueness.
   */
  private generateIdFragment(): string {
    const slugify = (input: string): string =>
      input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');

    let base = this.appName ? slugify(this.appName) : '';

    if (!base) {
      // Fallback to hostname (without port)
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      base = slugify(host);
    }

    if (!base) {
      base = 'key';
    }

    return `${base}-${Date.now()}`;
  }

  /**
   * Expose the global VDRRegistry instance
   */
  static get registry(): VDRRegistry {
    return VDRRegistry.getInstance();
  }
}

/**
 * Resolve Rooch network from hostname – mimics logic from cadop-service registry.ts
 */
function resolveNetworkFromHost(hostname: string): 'test' | 'main' {
  let cleanHost = hostname.replace(/^https?:\/\//, '');
  if (cleanHost.includes(':')) cleanHost = cleanHost.split(':')[0];
  const h = cleanHost.toLowerCase();

  if (h.startsWith('test-') || h === 'test-id.nuwa.dev') return 'test';
  if (h === 'id.nuwa.dev' || h.endsWith('.id.nuwa.dev')) return 'main';
  return 'test';
} 