import type { KeyType, AddKeyRequestPayloadV1, VerificationRelationship } from '@nuwa-ai/identity-kit';
import {
  KeyManager,
  CryptoUtils,
  StoredKey,
  MultibaseCodec,
  KeyTypeInput,
  toKeyType,
  validateScopes,
} from '@nuwa-ai/identity-kit';
import { LocalStorageKeyStore } from '../keystore';

export interface ConnectOptions {
  cadopDomain?: string;
  keyType?: KeyTypeInput;          // Default: KeyType.ED25519
  idFragment?: string;
  relationships?: VerificationRelationship[];  // Default: ['authentication']
  redirectPath?: string;     // Default: '/callback'
  agentDid?: string;         // Target Agent DID, optional
  /** Custom session key scopes (for authentication VM) */
  scopes?: string[];
}

export interface AuthResult {
  success: boolean;
  agentDid?: string;
  keyId?: string;
  error?: string;
}

interface TempKey {
  privateKeyMultibase: string;
  publicKeyMultibase: string;
  keyType: KeyType;
  idFragment: string;
}

/**
 * Manages deep link authentication flow
 */
export class DeepLinkManager {
  private keyManager: KeyManager;
  private sessionStorage: Storage;

  constructor(options: {
    keyManager?: KeyManager;
    sessionStorage?: Storage;
  } = {}) {
    this.keyManager = options.keyManager || new KeyManager({
      store: new LocalStorageKeyStore()
    });
    this.sessionStorage = options.sessionStorage || window.sessionStorage;
  }

  /**
   * Build a deep link URL for adding a key to a DID
   */
  async buildAddKeyUrl(opts: ConnectOptions = {}): Promise<{
    url: string;
    state: string;
    privateKeyMultibase: string;
    publicKeyMultibase: string;
  }> {
    const cadopDomainRaw = opts.cadopDomain || 'id.nuwa.dev';
    const cadopDomain = cadopDomainRaw.startsWith('http://') || cadopDomainRaw.startsWith('https://')
      ? cadopDomainRaw.replace(/\/$/, '') // trim trailing slash
      : (/^(localhost|\d+\.\d+\.\d+\.\d+(:\d+)?)$/.test(cadopDomainRaw)
          ? `http://${cadopDomainRaw}`
          : `https://${cadopDomainRaw}`);
    const keyType = toKeyType((opts.keyType ?? 'Ed25519VerificationKey2020') as KeyTypeInput);
    const idFragment = opts.idFragment || `key-${Date.now()}`;
    const relationships = opts.relationships || ['authentication'];
    const redirectPath = opts.redirectPath || '/callback';

    // Validate scopes if provided
    if (opts.scopes && opts.scopes.length > 0) {
      const scopeValidation = validateScopes(opts.scopes);
      if (!scopeValidation.valid) {
        throw new Error(`Invalid scope format: ${scopeValidation.invalidScopes.join(', ')}`);
      }
    }

    // Generate a random state to prevent CSRF
    const state = this.generateRandomState();
    
    // Generate a key pair
    const { privateKey, publicKey } = await CryptoUtils.generateKeyPair(keyType);
    const privateKeyMultibase = MultibaseCodec.encodeBase58btc(privateKey);
    const publicKeyMultibase = MultibaseCodec.encodeBase58btc(publicKey);
    
    // Store the private key temporarily in session storage
    this.sessionStorage.setItem(`nuwa_temp_key_${state}`, JSON.stringify({
      privateKeyMultibase: privateKeyMultibase,
      publicKeyMultibase: publicKeyMultibase,
      keyType,
      idFragment,
    }));

    // Build payload per spec (versioned JSON -> Base64URL)
    const redirectUri = new URL(redirectPath, window.location.origin).toString();

    const payload: AddKeyRequestPayloadV1 = {
      version: 1,
      verificationMethod: {
        type: keyType,
        publicKeyMultibase: publicKeyMultibase,
        idFragment,
      },
      verificationRelationships: relationships,
      redirectUri,
      state,
    };

    if (opts.agentDid) {
      payload.agentDid = opts.agentDid;
    }

    if (opts.scopes && opts.scopes.length > 0) {
      payload.scopes = opts.scopes;
    }

    const encodedPayload = MultibaseCodec.encodeBase64url(JSON.stringify(payload));

    return {
      url: `${cadopDomain}/add-key?payload=${encodedPayload}`,
      state,
      privateKeyMultibase,
      publicKeyMultibase,
    };
  }

  /**
   * Handle the callback from the deep link
   */
  async handleCallback(search: string): Promise<AuthResult> {
    const params = new URLSearchParams(search);
    const state = params.get('state');
    const agentDid = params.get('agentDid') || params.get('agent');
    const keyId = params.get('key_id') || params.get('keyId');
    const errorRaw = params.get('error');
    const error = errorRaw ? decodeURIComponent(errorRaw) : undefined;

    // Immediate failure if error param present and no success flag
    if (error && !params.has('success')) {
      return { success: false, error };
    }

    const successFlag = params.get('success');

    if (successFlag === '0') {
      return { success: false, error: error || 'Operation cancelled' };
    }

    if (!state || !agentDid || !keyId) {
      return { 
        success: false, 
        error: 'Missing required parameters in callback'
      };
    }

    // Retrieve the temporary key from session storage
    const tempKeyJson = this.sessionStorage.getItem(`nuwa_temp_key_${state}`);
    if (!tempKeyJson) {
      return {
        success: false,
        error: 'No matching key found for the provided state'
      };
    }

    try {
      const tempKey: TempKey = JSON.parse(tempKeyJson);
      
      // Create a stored key object
      const storedKey: StoredKey = {
        keyId,
        keyType: tempKey.keyType,
        publicKeyMultibase: tempKey.publicKeyMultibase,
        privateKeyMultibase: tempKey.privateKeyMultibase,
      };

      // Save the key to the key manager
      await this.keyManager.importKey(storedKey);
      
      // Clean up the temporary key
      this.sessionStorage.removeItem(`nuwa_temp_key_${state}`);

      return {
        success: true,
        agentDid,
        keyId,
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to process callback: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  /**
   * Generate a random state string
   */
  private generateRandomState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
} 