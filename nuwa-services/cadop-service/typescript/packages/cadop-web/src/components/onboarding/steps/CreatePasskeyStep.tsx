import { KeyRound } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  FixedCardActionButton,
  FixedCardLayout,
  FixedCardLoading,
} from '@/components/ui';
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
      <FixedCardLoading
        title="Creating Passkey..."
        message="Please complete the passkey creation in your device"
      />
    );
  }

  if (error) {
    return (
      <FixedCardLayout
        icon={<KeyRound className="h-12 w-12 text-red-400" />}
        title="Passkey creation failed"
        actions={
          <FixedCardActionButton onClick={handleCreate} size="lg">
            Retry
          </FixedCardActionButton>
        }
      >
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </FixedCardLayout>
    );
  }

  return (
    <FixedCardLayout
      icon={<KeyRound className="h-12 w-12 text-primary-600" />}
      title="Create Passkey for Nuwa DID"
      subtitle="We will use the passkey to generate your Nuwa DID."
      actions={
        <FixedCardActionButton onClick={handleCreate} size="lg">
          Create Passkey
        </FixedCardActionButton>
      }
    >
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md text-center">
        <p className="text-blue-800 font-semibold text-md">
          Please Note: The passkey will be securely stored on your device for DID authentication and
          management.
        </p>
      </div>
    </FixedCardLayout>
  );
};
