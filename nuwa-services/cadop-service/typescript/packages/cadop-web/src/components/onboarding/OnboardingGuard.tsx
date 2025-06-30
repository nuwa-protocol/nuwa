import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Spinner, SpinnerContainer } from '@/components/ui';

import { AuthStore, UserStore } from '@/lib/storage';
import { PasskeyService } from '@/lib/passkey/PasskeyService';
import { AgentService } from '@/lib/agent/AgentService';
import { RoochClient } from '@roochnetwork/rooch-sdk';
import { ROOCH_RPC_URL } from '@/config/env';

import { CreatePasskeyStep } from './steps/CreatePasskeyStep';
import { CreateAgentStep } from './steps/CreateAgentStep';
import { ClaimGasStep } from './steps/ClaimGasStep';

export interface OnboardingGuardProps {
  children: React.ReactNode;
}

// Minimum balance threshold (RGAS)
const MIN_GAS = 0.1;

export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [userDid, setUserDid] = useState<string | null>(null);
  const [agentDid, setAgentDid] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<'checking' | 'passkey' | 'agent' | 'gas' | 'done'>('checking');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUserDid = AuthStore.getCurrentUserDid();
    if (!currentUserDid) {
      setStep('passkey');
      return;
    }
    setUserDid(currentUserDid);

    const agents = UserStore.listAgents(currentUserDid);
    if (!agents || agents.length === 0) {
      setStep('agent');
      return;
    }
    const firstAgent = agents[0];
    setAgentDid(firstAgent);
    // Check existing gas balance before deciding the next step
    checkGas(firstAgent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkGas = async (did: string) => {
    try {
      setLoading(true);
      const address = did.split(':')[2];
      const client = new RoochClient({ url: ROOCH_RPC_URL });
      const resp = await client.getBalances({ owner: address, cursor: null, limit: '10' });
      const balances = resp.data || [];
      console.log('balances', balances);
      const gas = balances.find(b => b.coin_type === '0x3::gas_coin::RGas');
      const amount = gas ? parseFloat(gas.balance) : 0;
      if (amount < MIN_GAS) {
        setStep('gas');
      } else {
        setStep('done');
      }
    } catch (error) {
      console.error('Failed to check gas:', error);
      setStep('gas');
    } finally {
      setLoading(false);
    }
  };

  // Passkey created callback
  const handlePasskeyCreated = (newDid: string) => {
    setUserDid(newDid);
    setStep('agent');
  };

  // Agent created callback
  const handleAgentCreated = (did: string) => {
    setAgentDid(did);
    // Show loading spinner while checking gas for the new agent
    setStep('checking');
    // After creating a new agent, verify if gas needs to be claimed
    checkGas(did);
  };

  const handleGasClaimed = () => {
    // After user clicked Next from ClaimGasStep, consider flow done.
    setStep('done');
  };

  // All done, render children
  useEffect(() => {
    if (step === 'done') {
      // If URL has ?target=xxx, redirect to it
      const searchParams = new URLSearchParams(location.search);
      const target = searchParams.get('target');
      if (target) {
        navigate(target, { replace: true });
      } else if (!children) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [step, location.search, navigate, children]);

  if (step === 'checking' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="large" />
      </div>
    );
  }

  if (step === 'passkey') {
    return <CreatePasskeyStep onComplete={handlePasskeyCreated} />;
  }
  if (step === 'agent' && userDid) {
    return <CreateAgentStep userDid={userDid} onComplete={handleAgentCreated} />;
  }
  if (step === 'gas' && agentDid) {
    return <ClaimGasStep agentDid={agentDid} onComplete={handleGasClaimed} />;
  }

  // All good
  return <>{children}</>;
};
