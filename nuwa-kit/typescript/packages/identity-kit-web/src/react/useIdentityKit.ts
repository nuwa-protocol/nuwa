import { useState, useEffect, useCallback } from 'react';
import { IdentityKitWeb } from '..';
import { NIP1SignedObject } from '@nuwa-ai/identity-kit';

export interface IdentityKitState {
  isConnected: boolean;
  isConnecting: boolean;
  agentDid: string | null;
  keyId: string | null;
  error: string | null;
}

export interface IdentityKitHook {
  state: IdentityKitState;
  connect: () => Promise<void>;
  sign: (payload: any) => Promise<NIP1SignedObject>;
  verify: (sig: NIP1SignedObject) => Promise<boolean>;
  logout: () => Promise<void>;
  sdk: IdentityKitWeb | null;
}

export interface UseIdentityKitOptions {
  appName?: string;
  cadopDomain?: string;
  storage?: 'local' | 'indexeddb';
  autoConnect?: boolean;
  roochRpcUrl?: string;
}

/**
 * React hook for Nuwa Identity Kit (Web)
 */
export function useIdentityKit(options: UseIdentityKitOptions = {}): IdentityKitHook {
  const [sdk, setSdk] = useState<IdentityKitWeb | null>(null);
  const [state, setState] = useState<IdentityKitState>({
    isConnected: false,
    isConnecting: false,
    agentDid: null,
    keyId: null,
    error: null,
  });

  /**
   * Helper – refresh connection state from SDK instance
   */
  async function refreshConnection(kit: IdentityKitWeb | null = sdk) {
    if (!kit) return;
    const isConnected = await kit.isConnected();
    if (isConnected) {
      const did = await kit.getDid();
      const keyIds = await kit.listKeyIds();
      setState({
        isConnected: true,
        isConnecting: false,
        agentDid: did,
        keyId: keyIds.length > 0 ? keyIds[0] : null,
        error: null,
      });
    } else {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
      }));
    }
  }

  // Initialize SDK
  useEffect(() => {
    async function initSdk() {
      try {
        const newSdk = await IdentityKitWeb.init({
          appName: options.appName,
          cadopDomain: options.cadopDomain,
          storage: options.storage,
          roochRpcUrl: options.roochRpcUrl,
        });
        setSdk(newSdk);

        // Check connection status
        await refreshConnection(newSdk);
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: `Failed to initialize SDK: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    }

    initSdk();
  }, [options.appName, options.cadopDomain, options.storage]);

  // Listen for postMessage from callback window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data && event.data.type === 'nuwa-auth-success') {
        // Re-check connection status when callback signals success
        refreshConnection();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sdk]);

  // Auto connect
  useEffect(() => {
    if (options.autoConnect && sdk && !state.isConnected && !state.isConnecting) {
      connect();
    }
  }, [sdk, options.autoConnect, state.isConnected, state.isConnecting]);

  // Connect action
  const connect = useCallback(async () => {
    if (!sdk) {
      setState(prev => ({ ...prev, error: 'SDK not initialized' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      await sdk.connect();
      // Actual connection result will be handled via postMessage in callback
      setState(prev => ({ ...prev, isConnecting: false }));
    } catch (error) {
      setState({
        isConnected: false,
        isConnecting: false,
        agentDid: null,
        keyId: null,
        error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [sdk]);

  // Sign operation
  const sign = useCallback(async (payload: any): Promise<NIP1SignedObject> => {
    if (!sdk) throw new Error('SDK not initialized');
    if (!state.isConnected) throw new Error('Not connected');
    return sdk.sign(payload);
  }, [sdk, state.isConnected]);

  // Verify signature
  const verify = useCallback(async (sig: NIP1SignedObject): Promise<boolean> => {
    if (!sdk) throw new Error('SDK not initialized');
    return sdk.verify(sig);
  }, [sdk]);

  // Logout
  const logout = useCallback(async (): Promise<void> => {
    if (!sdk) throw new Error('SDK not initialized');
    await sdk.logout();
    setState({
      isConnected: false,
      isConnecting: false,
      agentDid: null,
      keyId: null,
      error: null,
    });
  }, [sdk]);

  return { state, connect, sign, verify, logout, sdk };
} 