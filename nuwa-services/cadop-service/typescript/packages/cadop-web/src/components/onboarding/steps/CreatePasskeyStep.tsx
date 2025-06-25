import React, { useState } from 'react';
import { Button, Spinner, Alert, AlertTitle, AlertDescription } from '@/components/ui';
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
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <div className="w-full max-w-md">
          <Alert variant="destructive">
            <AlertTitle>Failed to create Passkey</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={handleCreate}>Retry</Button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-2">Create a Passkey to get started</h2>
          <p className="text-gray-600 mb-6">We will use a platform Passkey to generate your user DID.</p>
          <Button onClick={handleCreate}>
            Create Passkey
          </Button>
        </div>
      )}
    </div>
  );
};
