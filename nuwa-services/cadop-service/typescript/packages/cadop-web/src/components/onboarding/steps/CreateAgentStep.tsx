import React, { useEffect, useState, useRef } from 'react';
import { Button, Spin, Result, Progress } from 'antd';
import { AgentService } from '@/lib/agent/AgentService';

interface Props {
  userDid: string;
  onComplete: (agentDid: string) => void;
}

export const CreateAgentStep: React.FC<Props> = ({ userDid, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentDid, setAgentDid] = useState<string | null>(null);

  const handleCreate = async (interactive = true) => {
    if (loading || agentDid) return; // guard against duplicate calls
    setLoading(true);
    setError(null);
    try {
      const service = new AgentService();
      const status = await service.createAgent(interactive);
      if (status.agentDid) {
        setAgentDid(status.agentDid);
        // Wait for user confirmation via Next button instead of auto continue
      } else {
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
        <Result
          status="error"
          title="Agent creation failed"
          subTitle={error}
          extra={[<Button onClick={retry}>Retry</Button>]}
        />
      </div>
    );
  }

  // Success UI – show details & Next button
  if (agentDid) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Result
          status="success"
          title="Agent DID Created"
          subTitle={agentDid}
          extra={[
            <Button type="primary" key="next" onClick={() => onComplete(agentDid)}>
              Next
            </Button>,
          ]}
        />
      </div>
    );
  }

  return null;
};
