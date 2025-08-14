import { useState, useEffect } from 'react';
import { DIDService } from '@/lib/did/DIDService';
import { useAuth } from '@/lib/auth/AuthContext';
import { UserStore } from '@/lib/storage';

export interface UseDIDServiceResult {
  didService: DIDService | null;
  isLoading: boolean;
  error: string | null;
}

// A thin hook to initialise DIDService based on a target DID & optional credentialId
export function useDIDService(targetDid: string | null | undefined): UseDIDServiceResult {
  const [didService, setDidService] = useState<DIDService | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { userDid, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!targetDid) return;
    // Wait until auth bootstrap finishes to avoid initializing with undefined credentialId
    if (authLoading) return;

    const creds = userDid ? UserStore.listCredentials(userDid) : [];
    const credentialId = creds.length > 0 ? creds[0] : undefined;

    setIsLoading(true);
    DIDService.initialize(targetDid, credentialId)
      .then(setDidService)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoading(false));
  }, [targetDid, userDid, authLoading]);

  return { didService, isLoading, error };
}
