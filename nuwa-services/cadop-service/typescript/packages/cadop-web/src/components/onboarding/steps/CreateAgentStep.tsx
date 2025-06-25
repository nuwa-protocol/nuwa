import React, { useEffect, useState, useRef } from 'react';
import { Button, Spin, Progress } from 'antd';
import { AgentService } from '@/lib/agent/AgentService';
import { DIDCreationStatus } from '@/components/DIDCreationStatus';
import type { AgentDIDCreationStatus as DIDStatus } from '@cadop/shared';

interface Props {
  userDid: string;
  onComplete: (agentDid: string) => void;
}

export const CreateAgentStep: React.FC<Props> = ({ userDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didStatus, setDidStatus] = useState<DIDStatus | null>(null);
  const agentDid = didStatus?.agentDid ?? null;

  const handleCreate = async (interactive = true) => {
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
  };

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    handleCreate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Spin size="large" />
        <Progress percent={70} status="active" style={{ width: 300 }} />
        <div>Creating your Agent DID…</div>
      </div>
    );
  }

  if (error) {
    const retry = () => handleCreate(true);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <DIDCreationStatus
          status={{
            status: 'failed',
            createdAt: new Date(),
            updatedAt: new Date(),
            error,
          }}
          onRetry={retry}
        />
      </div>
    );
  }

  if (didStatus) {
    const retry = () => handleCreate(true);
    const isCompleted = didStatus.status === 'completed';
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-6">
        <DIDCreationStatus status={didStatus} onRetry={retry} />
        {isCompleted && agentDid && (
          <Button type="primary" onClick={() => onComplete(agentDid)}>
            Next
          </Button>
        )}
      </div>
    );
  }

  return null;
};
