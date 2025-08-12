import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { VDRRegistry, createVDR } from '@nuwa-ai/identity-kit';
import { ROOCH_RPC_URL } from '@/config/env';

interface VDRContextValue {
  /** Global VDRRegistry singleton */
  registry: VDRRegistry;
  /** True when the default Rooch VDR has been registered */
  initialised: boolean;
  /** Error information if initialisation failed */
  error: string | null;
}

const VDRContext = createContext<VDRContextValue | undefined>(undefined);

/**
 * Hook that lazily registers the default Rooch VDR exactly once and returns
 * the (already singleton) `VDRRegistry` instance for consumers.
 */
function useInitialiseVDR(): VDRContextValue {
  const [initialised, setInitialised] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registry = useMemo(() => VDRRegistry.getInstance(), []);

  useEffect(() => {
    if (initialised) return;
    try {
      // If Rooch VDR not yet registered, do it now.
      const hasRooch = Boolean((registry as any).getVDR?.('rooch'));
      if (!hasRooch) {
        const roochVDR = createVDR('rooch', {
          rpcUrl: ROOCH_RPC_URL,
          debug: import.meta.env.DEV,
        });
        registry.registerVDR(roochVDR);
      }
      setInitialised(true);
    } catch (err) {
      console.error('[VDRProvider] failed to initialise VDRRegistry', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [initialised, registry]);

  return { registry, initialised, error };
}

export const VDRProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useInitialiseVDR();
  return <VDRContext.Provider value={value}>{children}</VDRContext.Provider>;
};

export function useVDR() {
  const ctx = useContext(VDRContext);
  if (!ctx) {
    throw new Error('useVDR must be used within a <VDRProvider>');
  }
  return ctx;
}
