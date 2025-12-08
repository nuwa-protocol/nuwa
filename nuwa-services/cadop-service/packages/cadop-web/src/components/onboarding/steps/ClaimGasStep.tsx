import { Coins } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FixedCardActionButton, FixedCardLayout, FixedCardLoading } from '@/components/ui';
import { useHubDeposit } from '@/hooks/useHubDeposit';
import { claimTestnetGas } from '@/lib/rooch/faucet';

interface Props {
  agentDid: string;
  onComplete: () => void;
}

export const ClaimGasStep: React.FC<Props> = ({ agentDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [claimCompleted, setClaimCompleted] = useState(false);
  const [shouldDeposit, setShouldDeposit] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState(0);
  const depositTriggeredRef = useRef(false);
  const { depositPercentOfClaimed } = useHubDeposit(agentDid);

  const performDeposit = useCallback(async () => {
    if (!depositPercentOfClaimed) return;

    try {
      setLoading(true);
      setDepositError(null);
      console.info('Performing deposit');
      const result = await depositPercentOfClaimed(claimedAmount, 50);
      if (result && !result.confirmed) {
        console.warn('Deposit sent but not confirmed within timeout period');
      }
      console.info('Deposit process completed');
      setLoading(false);
      onComplete();
    } catch (error) {
      console.error('Deposit failed:', error);
      setDepositError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }, [depositPercentOfClaimed, claimedAmount, onComplete]);

  // Handle deposit when conditions are met
  useEffect(() => {
    if (shouldDeposit && !depositTriggeredRef.current) {
      depositTriggeredRef.current = true;
      performDeposit();
    }
  }, [shouldDeposit, performDeposit, depositPercentOfClaimed]);

  const claimGas = useCallback(async () => {
    if (claimCompleted) {
      console.debug('Claim already completed, skipping');
      return;
    }

    setLoading(true);
    setClaimError(null);
    try {
      const address = agentDid.split(':')[2];
      const claimed = await claimTestnetGas(address);
      setClaimCompleted(true);

      // Set up deposit trigger
      setClaimedAmount(claimed);
      setShouldDeposit(true);
    } catch (claimError) {
      // Only set error for claiming failures, not deposit failures
      setClaimError(claimError instanceof Error ? claimError.message : String(claimError));
    }
  }, [agentDid, claimCompleted]);

  useEffect(() => {
    if (!claimError) {
      claimGas();
    }
  }, [claimError, claimGas]);

  if (loading && !claimError && !depositError) {
    return <FixedCardLoading title="Claiming Gas" message="Claiming gas for your agent..." />;
  }

  // Error state
  if (depositError) {
    return (
      <FixedCardLayout
        icon={<Coins className="h-12 w-12 text-red-400" />}
        title="Claiming Gas Failed"
        subtitle="Please make sure you have used the correct passkey to authorize"
        actions={
          <div className="grid grid-col-1 gap-2">
            <FixedCardActionButton onClick={performDeposit} variant="default" size="lg">
              Retry
            </FixedCardActionButton>
            <FixedCardActionButton onClick={onComplete} variant="secondary" size="lg">
              Skip
            </FixedCardActionButton>
          </div>
        }
      ></FixedCardLayout>
    );
  }
  if (claimError) {
    return (
      <FixedCardLayout
        icon={<Coins className="h-12 w-12 text-red-400" />}
        title="Claiming Gas Failed"
        subtitle="Please make sure you have used the correct passkey to authorize"
        actions={
          <div className="grid grid-col-1 gap-2">
            <FixedCardActionButton onClick={claimGas} variant="default" size="lg">
              Retry
            </FixedCardActionButton>
            <FixedCardActionButton onClick={onComplete} variant="secondary" size="lg">
              Skip
            </FixedCardActionButton>
          </div>
        }
      ></FixedCardLayout>
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
      <div></div>
    </FixedCardLayout>
  );
};
