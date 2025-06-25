import React, { useState } from 'react';
import { Button, SpinnerContainer, Spinner, Alert, AlertTitle, AlertDescription } from '@/components/ui';
import { claimTestnetGas } from '@/lib/rooch/faucet';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Props {
  agentDid: string;
  onComplete: () => void;
}

export const ClaimGasStep: React.FC<Props> = ({ agentDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);

  const claimGas = async () => {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="large" />
      </div>
    );
  }

  // Success page
  if (claimedAmount !== null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Success</h2>
            <p className="text-gray-600 mb-6">Claimed {Math.floor(claimedAmount / 100000000)} RGAS</p>
            <Button onClick={onComplete}>
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <AlertTitle>Failed to claim RGas</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={claimGas}>Retry</Button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-2">Claim RGas</h2>
          <p className="text-gray-600 mb-6">Click the button below to claim free testnet RGas.</p>
          <Button onClick={claimGas}>
            Claim RGas
          </Button>
        </div>
      )}
    </div>
  );
};
