import { useState } from 'react';
import { 
  BaseMultibaseCodec, 
  DIDAuth,
} from '@nuwa-ai/identity-kit';
import type { DIDDocument } from '@nuwa-ai/identity-kit';
import { KeyStore } from '../services/KeyStore';
import { registry } from '../services/registry';
import { SimpleSigner } from '../services/SimpleSigner';

interface SignButtonProps {
  onSignatureCreated: (signature: unknown) => void;
  onError?: (error: Error) => void;
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