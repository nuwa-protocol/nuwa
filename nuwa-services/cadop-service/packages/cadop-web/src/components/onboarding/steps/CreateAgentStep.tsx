import type { AgentDIDCreationStatus as DIDStatus } from '@cadop/shared';
import { AlertTriangle, Bot } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DIDCreationStatus } from '@/components/DIDCreationStatus';
import { FixedCardActionButton, FixedCardLayout, Progress, Spinner } from '@/components/ui';
import { AgentService } from '@/lib/agent/AgentService';

interface Props {
  userDid: string;
  onComplete: (agentDid: string) => void;
}

export const CreateAgentStep: React.FC<Props> = ({ userDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didStatus, setDidStatus] = useState<DIDStatus | null>(null);
  const agentDid = didStatus?.agentDid ?? null;

  const handleCreate = useCallback(
    async (interactive = true) => {
      if (loading || agentDid) return; // guard against duplicate calls
      setLoading(true);
      setError(null);
      try {
        const service = new AgentService();
        const statusResp = await service.createAgent(interactive);
        setDidStatus(statusResp);
        if (!statusResp.agentDid) {
          throw new Error('Agent creation returned no DID');
        }
      } catch (e: any) {
        // If NotAllowedError, ask user to retry interactively
        if (e?.name === 'NotAllowedError') {
          setError('Please authorise with Passkey to continue');
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, agentDid]
  );

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    handleCreate(true);
  }, [handleCreate]);

  useEffect(() => {
    if (didStatus?.status === 'completed' && agentDid) {
      onComplete(agentDid);
    }
  }, [didStatus, agentDid, onComplete]);

  if (loading) {
    return (
      <FixedCardLayout
        icon={<Bot className="h-12 w-12 text-primary-600" />}
        title="Creating Agent DID"
        subtitle="Creating your agent DID..."
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <Spinner size="large" />
          <Progress value={70} className="w-full max-w-sm" />
          <p className="text-sm text-gray-600 text-center">Creating, please wait...</p>
        </div>
      </FixedCardLayout>
    );
  }

  if (error) {
    const retry = () => handleCreate(true);
    return (
      <FixedCardLayout
        icon={<AlertTriangle className="h-12 w-12 text-red-400" />}
        title="Creating Agent DID failed"
        actions={
          <FixedCardActionButton onClick={retry} size="lg">
            Retry
          </FixedCardActionButton>
        }
      >
        <DIDCreationStatus
          status={{
            status: 'failed',
            createdAt: new Date(),
            updatedAt: new Date(),
            error,
          }}
          onRetry={retry}
        />
      </FixedCardLayout>
    );
  }

  if (didStatus) {
    const retry = () => handleCreate(true);
    const isCompleted = didStatus.status === 'completed';
    return (
      <FixedCardLayout
        icon={<Bot className="h-12 w-12 text-primary-600" />}
        title="Agent DID Status"
        actions={
          isCompleted && agentDid ? (
            <FixedCardActionButton onClick={() => onComplete(agentDid)} size="lg">
              Continue
            </FixedCardActionButton>
          ) : undefined
        }
      >
        <DIDCreationStatus status={didStatus} onRetry={retry} />
      </FixedCardLayout>
    );
  }

  return null;
};
