import React, { useState } from 'react';
import { Button, Spin, Result, message } from 'antd';
import { claimTestnetGas } from '@/lib/rooch/faucet';

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
      message.success(`Successfully claimed ${Math.floor(claimed / 100000000)} RGAS`);
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
        <Spin size="large" />
      </div>
    );
  }

  // Success page
  if (claimedAmount !== null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Result
          status="success"
          title={`Claimed ${Math.floor(claimedAmount / 100000000)} RGAS`}
          extra={[
            <Button type="primary" key="next" onClick={onComplete}>
              Next
            </Button>,
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <Result
          status="warning"
          title="Failed to claim RGas"
          subTitle={error}
          extra={[<Button onClick={claimGas}>Retry</Button>]}
        />
      ) : (
        <Result
          title="Insufficient RGas"
          subTitle="Click the button below to claim free testnet RGas."
          extra={[
            <Button type="primary" onClick={claimGas}>
              Claim RGas
            </Button>,
          ]}
        />
      )}
    </div>
  );
};
