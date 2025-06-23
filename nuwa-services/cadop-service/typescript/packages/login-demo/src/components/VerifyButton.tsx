import { useState } from 'react';
import type { NIP1SignedObject } from '@nuwa-ai/identity-kit';
import { useAuth } from '../App';

interface VerifyButtonProps {
  signature: NIP1SignedObject;
  onVerified: (ok: boolean) => void;
}

export function VerifyButton({ signature, onVerified }: VerifyButtonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const { verify } = useAuth();

  const handleVerify = async () => {
    try {
      setIsVerifying(true);
      const ok = await verify(signature);
      onVerified(ok);
    } catch (e) {
      console.error('Verify failed', e);
      onVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <button className="verify-button" disabled={isVerifying} onClick={handleVerify}>
      {isVerifying ? 'Verifying...' : 'Verify Signature'}
    </button>
  );
} 