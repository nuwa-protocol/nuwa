import { useState } from 'react';
import { DIDAuth } from '@nuwa-ai/identity-kit';
import type { NIP1SignedObject } from '@nuwa-ai/identity-kit';
import { registry } from '../services/registry';

interface VerifyButtonProps {
  signature: NIP1SignedObject;
  onVerified: (ok: boolean) => void;
}

export function VerifyButton({ signature, onVerified }: VerifyButtonProps) {
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    try {
      setIsVerifying(true);
      const ok = await DIDAuth.v1.verifySignature(signature, registry);
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