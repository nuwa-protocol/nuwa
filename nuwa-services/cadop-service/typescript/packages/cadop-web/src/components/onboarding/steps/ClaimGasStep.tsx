import { CheckCircle, Coins } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  FixedCardActionButton,
  FixedCardLayout,
  FixedCardLoading,
} from '@/components/ui';
import { claimTestnetGas } from '@/lib/rooch/faucet';

interface Props {
  agentDid: string;
  onComplete: () => void;
}

export const ClaimGasStep: React.FC<Props> = ({ agentDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);

  const claimGas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const address = agentDid.split(':')[2];
      const claimed = await claimTestnetGas(address);

      setClaimedAmount(claimed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agentDid]);

  useEffect(() => {
    if (!error) {
      claimGas().then(onComplete);
    }
  }, [error, claimGas, onComplete]);

  if (loading) {
    return <FixedCardLoading title="Claiming Gas" message="Claiming gas for your agent..." />;
  }

  // Success page
  if (claimedAmount !== null) {
    return (
      <FixedCardLayout
        icon={<CheckCircle className="h-12 w-12 text-green-600" />}
        title="Claimed Gas"
        subtitle={`You have claimed ${Math.floor(claimedAmount / 100000000)} RGAS`}
        actions={
          <FixedCardActionButton onClick={onComplete} size="lg">
            Continue
          </FixedCardActionButton>
        }
      >
        <div className="text-center text-gray-600">
          <p>Gas has been claimed successfully, you can now start using it.</p>
        </div>
      </FixedCardLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <FixedCardLayout
        icon={<Coins className="h-12 w-12 text-red-400" />}
        title="Claiming Gas Failed"
        actions={
          <FixedCardActionButton onClick={claimGas} variant="outline" size="lg">
            Retry
          </FixedCardActionButton>
        }
      >
        <Alert variant="destructive">
          <AlertTitle>Claiming Gas Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </FixedCardLayout>
    );
  }

  // Initial state (should not reach here due to useEffect)
  return (
    <FixedCardLayout
      icon={<Coins className="h-12 w-12 text-primary-600" />}
      title="Claiming Gas"
      subtitle="We will claim some gas for your agent..."
      actions={
        <FixedCardActionButton onClick={claimGas} size="lg">
          Claim Gas
        </FixedCardActionButton>
      }
    >
      <div className="text-center text-gray-600">
        <p>We will claim some gas for your agent...</p>
      </div>
    </FixedCardLayout>
  );
};
