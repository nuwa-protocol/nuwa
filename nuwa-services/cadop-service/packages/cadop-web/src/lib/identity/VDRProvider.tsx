import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { VDRRegistry } from '@nuwa-ai/identity-kit';
import { VDRManager } from './VDRManager';

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
 * Hook that uses the centralized VDRManager to initialize VDRs
 */
function useInitialiseVDR(): VDRContextValue {
  const [initialised, setInitialised] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registry = useMemo(() => VDRRegistry.getInstance(), []);

  useEffect(() => {
    async function init() {
      if (initialised) return;

      try {
        console.info('[VDRProvider] Initialising VDRs using VDRManager...');
        const vdrManager = VDRManager.getInstance();
        await vdrManager.initialize();
        setInitialised(true);
        console.info('[VDRProvider] VDRs initialised successfully');
      } catch (err) {
        console.error('[VDRProvider] Failed to initialise VDRs:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    init();
  }, [initialised]);

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
