import { useState } from 'react';
import { 
  BaseMultibaseCodec, 
  NuwaIdentityKit, 
  KEY_TYPE,
  VDRRegistry,
  RoochVDR,
} from '@nuwa-ai/identity-kit';
import type { SignerInterface, KeyType } from '@nuwa-ai/identity-kit';
import { KeyStore } from '../services/KeyStore';
import { getCadopDomain } from '../services/DeepLink';

interface LoginButtonProps {
  onSignatureCreated: (signature: unknown) => void;
  onError?: (error: Error) => void;
}

function resolveNetworkFromHost(hostname: string): 'local' | 'test' | 'main' {
  let cleanHostname = hostname;
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    cleanHostname = hostname.split('//')[1];
  }
  
  if (cleanHostname.includes(':')) {
    cleanHostname = cleanHostname.split(':')[0];
  }

  const lowerHost = cleanHostname.toLowerCase();

  if (lowerHost === 'localhost' || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lowerHost)) {
    return 'local';
  }

  if (lowerHost.startsWith('test-') || lowerHost === 'test-id.nuwa.dev') {
    return 'test';
  }

  if (lowerHost === 'id.nuwa.dev' || lowerHost.endsWith('.id.nuwa.dev')) {
    return 'main';
  }

  return 'test';
}

function getRoochRpcUrl(): string {
  const cadopDomain = getCadopDomain();
  const network = resolveNetworkFromHost(cadopDomain);
  
  switch (network) {
    case 'main':
      return 'https://main-seed.rooch.network';
    case 'test':
      return 'https://test-seed.rooch.network';
    default:
      return 'https://test-seed.rooch.network';
  }
}

// Simple in-memory signer implementation
class SimpleSigner implements SignerInterface {
  private did: string;
  private keyId: string;
  private privateKey: Uint8Array;

  constructor(did: string, keyId: string, privateKey: Uint8Array) {
    this.did = did;
    this.keyId = keyId;
    this.privateKey = privateKey;
  }

  async listKeyIds(): Promise<string[]> {
    return [this.keyId];
  }

  async signWithKeyId(data: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.keyId) {
      throw new Error(`Key ID not found: ${keyId}`);
    }

    // Use the Web Crypto API to sign the data with Ed25519
    const key = await crypto.subtle.importKey(
      'raw',
      this.privateKey,
      { name: 'Ed25519' },
      false,
      ['sign']
    );
    
    return new Uint8Array(await crypto.subtle.sign('Ed25519', key, data));
  }

  async canSignWithKeyId(keyId: string): Promise<boolean> {
    return keyId === this.keyId;
  }

  getDid(): string {
    return this.did;
  }

  async getKeyInfo(keyId: string): Promise<{ type: KeyType; publicKey: Uint8Array } | undefined> {
    if (keyId !== this.keyId) return undefined;
    
    // For Ed25519, the public key can be derived from the private key
    // In a real implementation, you'd store both or derive properly
    return {
      type: KEY_TYPE.ED25519,
      publicKey: new Uint8Array(32) // Placeholder
    };
  }
}

export function LoginButton({ onSignatureCreated, onError }: LoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);

      // Get stored key
      const storedKey = KeyStore.get();
      if (!storedKey) {
        throw new Error('No key found. Please connect first.');
      }

      // Decode the stored keys
      const privateKey = BaseMultibaseCodec.decodeBase58btc(storedKey.privateKey);

      // Create a signer
      const signer = new SimpleSigner(
        storedKey.agentDid, 
        storedKey.keyId, 
        privateKey
      );

      const roochRpcUrl = getRoochRpcUrl();
      console.log(`Using Rooch RPC URL: ${roochRpcUrl}`);
      
      //const network = resolveNetworkFromHost(getCadopDomain());
      
      const roochVDR = new RoochVDR({
        rpcUrl: roochRpcUrl,
        debug: true,
      });
      
      const registry = VDRRegistry.getInstance();
      registry.registerVDR(roochVDR);

      // Initialize the identity kit with the signer
      const kit = await NuwaIdentityKit.fromExistingDID(storedKey.agentDid, signer);

      // Create a challenge with nonce and timestamp
      const challenge = {
        operation: 'login',
        params: {
          domain: window.location.hostname,
        },
        nonce: crypto.randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
      };

      // Sign the challenge
      const signature = await kit.createNIP1Signature(challenge, storedKey.keyId);

      // Pass the signature to the callback
      onSignatureCreated(signature);
    } catch (err) {
      console.error('Login failed:', err);
      onError?.(err instanceof Error ? err : new Error('Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleLogin} 
      disabled={isLoading}
      className="login-button"
    >
      {isLoading ? 'Signing...' : 'Login with Nuwa Agent'}
    </button>
  );
} 