import React, { useState } from 'react';
import { Button, Spin, Result } from 'antd';
import { PasskeyService } from '@/lib/passkey/PasskeyService';

interface Props {
  onComplete: (userDid: string) => void;
}

export const CreatePasskeyStep: React.FC<Props> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const service = new PasskeyService();
      const did = await service.ensureUser();
      onComplete(did);
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

  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <Result
          status="error"
          title="Failed to create Passkey"
          subTitle={error}
          extra={[<Button onClick={handleCreate}>Retry</Button>]}
        />
      ) : (
        <Result
          title="Create a Passkey to get started"
          subTitle="We will use a platform Passkey to generate your user DID."
          extra={[
            <Button type="primary" onClick={handleCreate}>
              Create Passkey
            </Button>,
          ]}
        />
      )}
    </div>
  );
};
