import type React from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { AuthStore, UserStore } from '@/lib/storage';
import { CreateAgentStep } from './steps/CreateAgentStep';
import { CreatePasskeyStep } from './steps/CreatePasskeyStep';

export interface OnboardingGuardProps {
  children: React.ReactNode;
}

export const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [userDid, setUserDid] = useState<string | null>(null);
  const [step, setStep] = useState<'checking' | 'passkey' | 'agent' | 'done'>('checking');

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
    setStep('done');
  }, []);

  // Passkey created callback
  const handlePasskeyCreated = (newDid: string) => {
    setUserDid(newDid);
    setStep('agent');
  };

  // Agent created callback
  const handleAgentCreated = (_did: string) => {
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

  if (step === 'checking') {
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

  // All good
  return <>{children}</>;
};
