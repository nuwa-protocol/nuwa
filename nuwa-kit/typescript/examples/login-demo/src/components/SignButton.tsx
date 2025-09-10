import { useState } from 'react';
import { useAuth } from '../App';

interface SignButtonProps {
  onSignatureCreated: (signature: unknown) => void;
  onError?: (error: Error) => void;
}

export function SignButton({ onSignatureCreated, onError }: SignButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { sign } = useAuth();

  const handleSign = async () => {
    try {
      setIsLoading(true);

      // Create a challenge with nonce and timestamp
      const challenge = {
        operation: 'login',
        params: {
          domain: window.location.hostname,
        },
      };

      // Sign the challenge using the hook's sign method
      const signature = await sign(challenge);

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
    <button onClick={handleSign} disabled={isLoading} className="sign-button">
      {isLoading ? 'Signing...' : 'Create Signature'}
    </button>
  );
}
