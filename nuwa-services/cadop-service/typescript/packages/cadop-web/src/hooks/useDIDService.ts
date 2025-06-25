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

  const { userDid } = useAuth();

  // auto fetch first credentialId if exists
  const autoCredentialId = (() => {
    if (!userDid) return undefined;
    const creds = UserStore.listCredentials(userDid);
    return creds.length > 0 ? creds[0] : undefined;
  })();

  useEffect(() => {
    if (!targetDid) return;
    setIsLoading(true);
    DIDService.initialize(targetDid, autoCredentialId)
      .then(setDidService)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoading(false));
  }, [targetDid, autoCredentialId]);

  return { didService, isLoading, error };
} 