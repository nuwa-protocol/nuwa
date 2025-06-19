import { useState } from 'react';
import { 
  BaseMultibaseCodec, 
  KEY_TYPE,
  DIDAuth,
  CryptoUtils,
} from '@nuwa-ai/identity-kit';
import type { SignerInterface, KeyType, DIDDocument } from '@nuwa-ai/identity-kit';
import { KeyStore } from '../services/KeyStore';
import { registry } from '../services/registry';

interface SignButtonProps {
  onSignatureCreated: (signature: unknown) => void;
  onError?: (error: Error) => void;
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
    return CryptoUtils.sign(data, this.privateKey, KEY_TYPE.ED25519);
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

export function SignButton({ onSignatureCreated, onError }: SignButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSign = async () => {
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
      
      // Create a challenge with nonce and timestamp
      const challenge = {
        operation: 'login',
        params: {
          domain: window.location.hostname,
        },
        nonce: crypto.randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
      };

      // Resolve DID document
      const didDoc = (await registry.resolveDID(storedKey.agentDid)) as DIDDocument;

      // Sign the challenge using DIDAuth v1
      const signature = await DIDAuth.v1.createSignature(
        challenge,
        signer,
        didDoc,
        storedKey.keyId,
      );

      // Pass the signature to the callback
      onSignatureCreated(signature);
    } catch (err) {
      console.error('Sign failed:', err);
      onError?.(err instanceof Error ? err : new Error('Sign failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleSign} 
      disabled={isLoading}
      className="sign-button"
    >
      {isLoading ? 'Signing...' : 'Create Signature'}
    </button>
  );
} 