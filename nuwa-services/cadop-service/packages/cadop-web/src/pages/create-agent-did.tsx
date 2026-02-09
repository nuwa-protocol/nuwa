import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { CreateAgentStep } from '@/components/onboarding/steps/CreateAgentStep';
import { useAuth } from '@/lib/auth/AuthContext';

export function CreateAgentDIDPage() {
  const { userDid } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hasPayload = !!searchParams.get('payload');

  if (!userDid) {
    navigate('/auth/login');
    return null;
  }

  const handleAgentCreated = (did: string) => {
    const payloadParam = searchParams.get('payload');
    if (payloadParam) {
      // Return to add-key page with the payload
      navigate(`/add-key?payload=${encodeURIComponent(payloadParam)}`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <MainLayout hasSidebar={false} hasHeader={!hasPayload}>
      <div className="max-w-2xl mx-auto py-8">
        <CreateAgentStep userDid={userDid} onComplete={handleAgentCreated} />
      </div>
    </MainLayout>
  );
}
